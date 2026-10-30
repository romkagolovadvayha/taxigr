package ru.grahovo.taxigroups;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private LinearLayout layout;
    private void text(String value,int size){TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setPadding(0,12,0,12);layout.addView(t);}
    private Button button(String label,View.OnClickListener action){Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setOnClickListener(action);layout.addView(b);return b;}
    @Override public void onCreate(Bundle saved){super.onCreate(saved);}
    @Override public void onResume(){super.onResume();render();}
    private void render(){
        ScrollView scroll=new ScrollView(this);layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);
        int p=(int)(20*getResources().getDisplayMetrics().density);layout.setPadding(p,p,p,p);scroll.addView(layout);setContentView(scroll);
        layout.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(p,p+insets.getSystemWindowInsetTop(),p,p+insets.getSystemWindowInsetBottom());return insets;});
        text("Группы такси",28);
        text("Только выбранные группы MAX и WhatsApp. Запросы такси передаются вашему сервису и приходят администратору в его боты.",16);
        text("Приложение получает доступ к уведомлениям телефона, но сохраняет и отправляет только подходящие сообщения выбранных групп. Доступ включается вручную и может быть отозван в любой момент.",15);
        try {
            JSONObject state=Store.state(this);
            if(!state.has("token")){
                text("На iPhone откройте сайт такси → Администрирование → Настройки → Сообщения из групп. Укажите названия групп и получите код.",16);
                EditText input=new EditText(this);input.setHint("Код из 12 символов");input.setSingleLine(true);input.setContentDescription("Код подключения Android");layout.addView(input);
                button("Подключить",view->{String code=input.getText().toString().trim().toUpperCase(java.util.Locale.ROOT);
                    if(!code.matches("[A-F0-9]{12}")){input.setError("Введите код из 12 символов");return;}
                    view.setEnabled(false);Api.EXECUTOR.execute(()->{try{Store.pair(this,Api.request("pair",new JSONObject().put("code",code),null));runOnUiThread(this::render);}
                    catch(Exception error){runOnUiThread(()->{view.setEnabled(true);input.setError(error instanceof Api.HttpError&&((Api.HttpError)error).code==401?"Код истёк или неверен":"Не удалось подключиться. Проверьте интернет и попробуйте снова.");});}});
                });
            }else{
                boolean access=getSystemService(NotificationManager.class).isNotificationListenerAccessGranted(new ComponentName(this,GroupNotificationListener.class));
                text(access?"Доступ к уведомлениям включён":"Разрешите доступ к уведомлениям",20);
                button("Настроить доступ к уведомлениям",v->startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
                JSONArray groups=state.getJSONArray("groups");StringBuilder names=new StringBuilder("Выбранные группы:\n");
                for(int i=0;i<groups.length();i++){JSONObject g=groups.getJSONObject(i);names.append(g.getString("provider")).append(" · ").append(g.getString("title")).append('\n');}text(names.toString(),16);
                boolean enabled=state.optBoolean("enabled");text(enabled?"Приём включён":"Приём приостановлен",18);
                button(enabled?"Приостановить":"Продолжить",v->{try{Store.pause(this,enabled);if(!enabled)Api.uploadSoon(this);render();}catch(Exception e){text("Не удалось сохранить настройку",16);}});
                text(state.optString("status","Ожидаем новое уведомление из выбранной группы"),16);
                text("В очереди: "+state.optJSONArray("queue").length(),15);
                button("Проверить связь и отправить очередь",v->{v.setEnabled(false);Api.EXECUTOR.execute(()->{
                    try{Api.request("device",null,Store.state(this).getString("token"));Store.status(this,"Связь с сервисом работает");Api.drain(this);}
                    catch(Exception e){try{if(e instanceof Api.HttpError&&((Api.HttpError)e).code==401)Store.clear(this);Store.status(this,"Проверьте подключение к сервису");}catch(Exception ignored){}}
                    runOnUiThread(this::render);
                });});
                button("Отключить этот Android",v->new android.app.AlertDialog.Builder(this).setMessage("Удалить подключение и очередь сообщений с телефона?")
                    .setNegativeButton("Отмена",null).setPositiveButton("Отключить",(dialog,which)->{Store.clear(this);getSystemService(android.app.job.JobScheduler.class).cancel(42);render();}).show());
                text("Оставьте телефон включённым и подключённым к интернету. Разрешите показ текста уведомлений в MAX и WhatsApp. Если Android ограничивает доступ для установленного APK, откройте сведения о приложении → меню → Разрешить ограниченные настройки.",15);
            }
            text("ФИО и телефон добавляет сервер только при надёжном совпадении. Имени автора из уведомления может быть недостаточно.",15);
        }catch(Exception error){text("Данные подключения недоступны. Подключите телефон заново.",16);button("Сбросить подключение",v->{Store.clear(this);render();});}
    }
}
