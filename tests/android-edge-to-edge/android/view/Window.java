package android.view;
public class Window {
    public int calls;
    public int status = 7;
    public int navigation = 9;
    public void setStatusBarColor(int color) { calls++; status = color; }
    public void setNavigationBarColor(int color) { calls++; navigation = color; }
    public int getStatusBarColor() { calls++; return status; }
    public int getNavigationBarColor() { calls++; return navigation; }
}
