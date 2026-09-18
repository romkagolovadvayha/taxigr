package test;
import android.os.Build;
import android.view.Window;
import android.view.WindowManager.LayoutParams;

public class WindowCalls {
    static int changeWindow(Window window, LayoutParams params, int cutout) {
        window.setStatusBarColor(11);
        window.setNavigationBarColor(13);
        params.layoutInDisplayCutoutMode = cutout;
        return window.getStatusBarColor() + window.getNavigationBarColor();
    }
    public static void main(String[] args) {
        for (int sdk : new int[]{24, 28, 29, 30, 34, 35, 36}) {
            Build.VERSION.SDK_INT = sdk;
            for (int cutout : new int[]{0, 1, 2, 3}) {
                Window window = new Window();
                LayoutParams params = new LayoutParams();
                int colors = changeWindow(window, params, cutout);
                if (sdk >= 35) {
                    if (window.calls != 0 || colors != 0 || params.layoutInDisplayCutoutMode != 3)
                        throw new AssertionError("Deprecated API executed on SDK " + sdk);
                } else if (window.calls != 4 || colors != 24 || params.layoutInDisplayCutoutMode != cutout) {
                    throw new AssertionError("Legacy behavior changed on SDK " + sdk);
                }
            }
        }
        System.out.println("Edge-to-edge: 28 SDK/cutout combinations passed");
    }
}
