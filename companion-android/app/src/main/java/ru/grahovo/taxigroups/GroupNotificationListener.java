package ru.grahovo.taxigroups;

import android.app.Notification;
import android.app.Person;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

public final class GroupNotificationListener extends NotificationListenerService {
    @Override public void onListenerConnected(){ Api.uploadSoon(this); }
    @Override public void onNotificationPosted(StatusBarNotification sbn){
        String provider=Rules.provider(sbn.getPackageName());if(provider==null)return;
        try {
            JSONObject state=Store.state(this);if(!state.optBoolean("enabled")||!state.has("token"))return;
            Notification notification=sbn.getNotification();
            if((notification.flags&Notification.FLAG_GROUP_SUMMARY)!=0)return;
            android.os.Bundle extras=notification.extras;
            CharSequence conversation=extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE);
            android.os.Parcelable[] messages=extras.getParcelableArray(Notification.EXTRA_MESSAGES);
            if(!extras.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION)||conversation==null||messages==null){Store.status(this,"Уведомление не содержит данных группы. Проверьте показ текста в мессенджере.");return;}
            String title=conversation.toString();boolean allowed=false;
            JSONArray groups=state.getJSONArray("groups");
            for(int i=0;i<groups.length();i++){JSONObject group=groups.getJSONObject(i);if(provider.equals(group.getString("provider"))&&Rules.normalize(title).equals(Rules.normalize(group.getString("title")))){allowed=true;break;}}
            if(!allowed)return;
            boolean queued=false;
            Notification.Style recovered=Notification.Builder.recoverBuilder(this,notification).getStyle();
            if(!(recovered instanceof Notification.MessagingStyle))return;
            for(Notification.MessagingStyle.Message message:((Notification.MessagingStyle)recovered).getMessages()){
                if(message.getText()==null||message.getSenderPerson()==null)continue;
                long sentAt=message.getTimestamp(), age=System.currentTimeMillis()-sentAt;
                if(age< -60000||age>3600000)continue;
                String text=message.getText().toString();if(!Rules.request(text))continue;
                Person sender=message.getSenderPerson();String name=sender.getName()==null?"":sender.getName().toString();
                String phoneUri=Rules.phoneUri(sender.getUri());
                String material=provider+"\n"+Rules.normalize(title)+"\n"+sentAt+"\n"+name+"\n"+text;
                byte[] hash=MessageDigest.getInstance("SHA-256").digest(material.getBytes(StandardCharsets.UTF_8));
                StringBuilder id=new StringBuilder();for(byte b:hash)id.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
                JSONObject event=new JSONObject().put("eventId",id.toString()).put("provider",provider)
                    .put("groupTitle",title).put("senderName",name.substring(0,Math.min(200,name.length())))
                    .put("text",text.substring(0,Math.min(2000,text.length()))).put("sentAt",sentAt);
                if(phoneUri!=null)event.put("senderUri",phoneUri);
                queued=Store.enqueue(this,event)||queued;
            }
            if(queued)Api.uploadSoon(this);
        }catch(Exception error){try{Store.status(this,"Не удалось прочитать уведомление. Откройте приложение для проверки.");}catch(Exception ignored){}}
    }
}
