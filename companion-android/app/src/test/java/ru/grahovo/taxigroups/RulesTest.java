package ru.grahovo.taxigroups;
import org.junit.Test;
import static org.junit.Assert.*;

public class RulesTest {
    @Test public void requests(){assertTrue(Rules.request("КТО ТАКСУЕТ???"));assertTrue(Rules.request("Кто может отвезти в Грахово?"));assertTrue(Rules.request("Нужно срочно такси"));assertFalse(Rules.request("Я таксую до вечера"));assertFalse(Rules.request("таксует Иван"));}
    @Test public void senderIdentity(){assertEquals("tel:+79998887766",Rules.phoneUri("tel:+7 (999) 888-77-66"));assertNull(Rules.phoneUri("+79998887766"));assertNull(Rules.phoneUri("Иван +79998887766"));assertNull(Rules.phoneUri("content://contacts/1"));}
    @Test public void sourcePackages(){assertEquals("max",Rules.provider("ru.oneme.app"));assertEquals("whatsapp",Rules.provider("com.whatsapp.w4b"));assertNull(Rules.provider("com.random.app"));}
}
