package ru.grahovo.taxigroups;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

public final class Rules {
    private static final Pattern REQUEST = Pattern.compile("(?:^| )(?:кто (?:сейчас )?таксует|(?:нужно|нужна|ищу|ищем|есть) (?:срочно )?такси|такси есть|кто (?:может )?(?:отвезти|подвезти|довезти|забрать))(?: |$)");
    public static String normalize(String text) { return Normalizer.normalize(text, Normalizer.Form.NFKC).trim().replaceAll("\\s+", " ").toLowerCase(Locale.forLanguageTag("ru")); }
    public static boolean request(String text) { return REQUEST.matcher(normalize(text).replace('ё','е').replaceAll("[^\\p{L}\\p{N}]+", " ").trim()).find(); }
    public static String provider(String packageName) {
        if ("ru.oneme.app".equals(packageName)) return "max";
        if ("com.whatsapp".equals(packageName) || "com.whatsapp.w4b".equals(packageName)) return "whatsapp";
        return null;
    }
    public static String phoneUri(String uri) {
        if (uri == null || !uri.startsWith("tel:+")) return null;
        String phone = uri.substring(4).replaceAll("[ ()-]", "");
        return phone.matches("\\+[1-9]\\d{7,14}") ? "tel:" + phone : null;
    }
    private Rules() {}
}
