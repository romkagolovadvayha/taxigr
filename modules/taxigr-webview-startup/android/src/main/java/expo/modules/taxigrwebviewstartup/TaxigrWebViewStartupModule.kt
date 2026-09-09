package expo.modules.taxigrwebviewstartup

import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewOutcomeReceiver
import androidx.webkit.WebViewStartUpConfig
import androidx.webkit.WebViewStartUpResult
import androidx.webkit.WebViewStartupException
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

class TaxigrWebViewStartupModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TaxigrWebViewStartup")

    AsyncFunction("prepare") { promise: Promise ->
      val context = appContext.reactContext?.applicationContext
      if (context == null) {
        promise.reject("ERR_WEBVIEW_STARTUP", "Application context unavailable", null)
        return@AsyncFunction
      }
      val executor = Executors.newSingleThreadExecutor()
      try {
        // Do not construct a WebView or call WebViewFeature before this callback:
        // doing so would force the cold startup back onto Android's UI thread.
        WebViewCompat.startUpWebView(
          context,
          WebViewStartUpConfig.Builder(executor).build(),
          object : WebViewOutcomeReceiver<WebViewStartUpResult, WebViewStartupException> {
            override fun onResult(result: WebViewStartUpResult) {
              executor.shutdown()
              promise.resolve(null)
            }

            override fun onError(error: WebViewStartupException) {
              executor.shutdown()
              promise.reject("ERR_WEBVIEW_STARTUP", "Unable to prepare WebView", error)
            }
          }
        )
      } catch (error: Exception) {
        executor.shutdown()
        promise.reject("ERR_WEBVIEW_STARTUP", "Unable to prepare WebView", error)
      }
    }
  }
}
