package ru.grahovo.taxigroups;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class Store {
    private static final String ALIAS = "taxigr-group-collector";
    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if (ks.containsAlias(ALIAS)) return (SecretKey) ks.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    private static JSONObject read(Context c) throws Exception {
        String stored = c.getSharedPreferences("collector", Context.MODE_PRIVATE).getString("encrypted", null);
        if (stored == null) return new JSONObject();
        JSONObject wrapper = new JSONObject(stored);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(wrapper.getString("iv"), Base64.NO_WRAP)));
        return new JSONObject(new String(cipher.doFinal(Base64.decode(wrapper.getString("data"), Base64.NO_WRAP)), StandardCharsets.UTF_8));
    }
    private static void write(Context c, JSONObject state) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        JSONObject wrapper = new JSONObject().put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .put("data", Base64.encodeToString(cipher.doFinal(state.toString().getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP));
        if (!c.getSharedPreferences("collector", Context.MODE_PRIVATE).edit().putString("encrypted", wrapper.toString()).commit()) throw new Exception("Storage unavailable");
    }
    static synchronized JSONObject state(Context c) throws Exception { return read(c); }
    static synchronized void pair(Context c, JSONObject config) throws Exception {
        config.put("enabled", true).put("queue", new JSONArray()).put("seen", new JSONObject()); write(c, config);
    }
    static synchronized void pause(Context c, boolean pause) throws Exception { JSONObject s=read(c); s.put("enabled",!pause); write(c,s); }
    static synchronized void clear(Context c) { c.getSharedPreferences("collector", Context.MODE_PRIVATE).edit().clear().commit(); }
    static synchronized boolean enqueue(Context c, JSONObject event) throws Exception {
        JSONObject s=read(c); if (!s.optBoolean("enabled") || !s.has("token")) return false;
        JSONObject oldSeen=s.optJSONObject("seen"), seen=new JSONObject(); long now=System.currentTimeMillis();
        if(oldSeen!=null) { java.util.Iterator<String> keys=oldSeen.keys(); while(keys.hasNext()){String k=keys.next(); if(now-oldSeen.optLong(k)<3600000)seen.put(k,oldSeen.get(k));} }
        String id=event.getString("eventId"); if(seen.has(id))return false;
        JSONArray old=s.optJSONArray("queue"), queue=new JSONArray();
        if(old!=null)for(int i=0;i<old.length();i++){JSONObject e=old.getJSONObject(i);if(now-e.getLong("sentAt")<3600000)queue.put(e);}
        if(queue.length()>=100 || seen.length()>=1000) { s.put("status","Очередь заполнена. Проверьте интернет.");write(c,s);return false; }
        queue.put(event);seen.put(id,now);s.put("queue",queue).put("seen",seen);write(c,s);return true;
    }
    static synchronized void remove(Context c, String id) throws Exception {
        JSONObject s=read(c); JSONArray old=s.optJSONArray("queue"), queue=new JSONArray();
        if(old!=null)for(int i=0;i<old.length();i++){JSONObject e=old.getJSONObject(i);if(!id.equals(e.getString("eventId")))queue.put(e);}
        s.put("queue",queue);write(c,s);
    }
    static synchronized void status(Context c, String text) throws Exception { JSONObject s=read(c);s.put("status",text);write(c,s); }
    private Store() {}
}
