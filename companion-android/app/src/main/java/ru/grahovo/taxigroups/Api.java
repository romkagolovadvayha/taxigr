package ru.grahovo.taxigroups;

import android.content.ComponentName;
import android.content.Context;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

final class Api {
    static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    static class HttpError extends Exception { final int code; HttpError(int code){super("HTTP "+code);this.code=code;} }
    static JSONObject request(String path, JSONObject body, String token) throws Exception {
        HttpURLConnection connection=(HttpURLConnection)new URL("https://api.taxigr.ru/v1/group-alerts/"+path).openConnection();
        connection.setConnectTimeout(10000);connection.setReadTimeout(15000);connection.setInstanceFollowRedirects(false);
        connection.setRequestMethod(body==null?"GET":"POST");
        if(token!=null)connection.setRequestProperty("Authorization","Bearer "+token);
        try {
            if(body!=null){connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");try(java.io.OutputStream out=connection.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}}
            int status=connection.getResponseCode();if(status<200||status>=300)throw new HttpError(status);
            try(InputStream in=connection.getInputStream();java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream()){
                byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1){out.write(buffer,0,n);if(out.size()>65536)throw new Exception("Response too large");}
                return new JSONObject(out.toString("UTF-8")).getJSONObject("data");
            }
        } finally {connection.disconnect();}
    }
    static void schedule(Context context) {
        JobScheduler scheduler=context.getSystemService(JobScheduler.class);
        scheduler.schedule(new JobInfo.Builder(42,new ComponentName(context,UploadJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true)
            .setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).build());
    }
    static void uploadSoon(Context context){Context app=context.getApplicationContext();schedule(app);EXECUTOR.execute(()->drain(app));}
    static synchronized boolean drain(Context c){
        try {
            JSONObject state=Store.state(c);
            if(!state.has("token")||!state.optBoolean("enabled"))return true;
            JSONArray queue=state.optJSONArray("queue");if(queue==null)return true;
            String token=state.getString("token");
            for(int i=0;i<queue.length();i++){
                JSONObject current=Store.state(c);if(!current.optBoolean("enabled")||!token.equals(current.optString("token")))return true;
                JSONObject event=queue.getJSONObject(i);
                if(System.currentTimeMillis()-event.getLong("sentAt")>=3600000){Store.remove(c,event.getString("eventId"));continue;}
                try{JSONObject result=request("events",event,token);Store.status(c,result.optBoolean("accepted")?"Сообщение принято сервисом":"Сообщение пропущено: проверьте время телефона и фильтр");}
                catch(HttpError error){
                    if(error.code==401){Store.clear(c);Store.status(c,"Подключение отозвано. Введите новый код.");return true;}
                    if(error.code==400||error.code==403||error.code==413){Store.status(c,"Сообщение отклонено. Проверьте настройки групп.");}
                    else throw error;
                }
                Store.remove(c,event.getString("eventId"));
            }
            return true;
        }catch(Exception error){try{Store.status(c,"Нет связи с сервисом. Повторим отправку автоматически.");}catch(Exception ignored){} return false;}
    }
    private Api(){}
}
