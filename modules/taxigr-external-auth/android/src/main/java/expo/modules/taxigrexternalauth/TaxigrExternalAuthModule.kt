package expo.modules.taxigrexternalauth

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TaxigrExternalAuthModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TaxigrExternalAuth")

    AsyncFunction("openVkMiniAppUrl") { url: String ->
      val context = appContext.reactContext
      val uri = Uri.parse(url)
      if (context == null || uri.scheme != "https" || uri.host != "vk.com" ||
        uri.userInfo != null || uri.port != -1 ||
        !Regex("/app[0-9]+").matches(uri.path ?: "")) {
        false
      } else try {
        context.startActivity(Intent(Intent.ACTION_VIEW, uri)
          .setPackage("com.vkontakte.android")
          .addCategory(Intent.CATEGORY_BROWSABLE)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
      } catch (_: ActivityNotFoundException) {
        false
      } catch (_: SecurityException) {
        false
      }
    }

    AsyncFunction("openMaxUrl") { url: String ->
      val context = appContext.reactContext
      val uri = Uri.parse(url)
      if (context == null || uri.scheme != "https" || uri.host != "max.ru" ||
        uri.userInfo != null || uri.port != -1) {
        false
      } else try {
        // Target MAX explicitly: Android may otherwise send even a supported
        // HTTPS bot link to the user's default browser. Keep start unchanged.
        // startActivity needs no package-visibility queries or new permissions.
        context.startActivity(Intent(Intent.ACTION_VIEW, uri)
          .setPackage("ru.oneme.app")
          .addCategory(Intent.CATEGORY_BROWSABLE)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
      } catch (_: ActivityNotFoundException) {
        false
      } catch (_: SecurityException) {
        false
      }
    }
  }
}
