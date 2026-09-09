package expo.modules.taxigrinstallsource

import android.content.Intent
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TaxigrInstallSourceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TaxigrInstallSource")

    Function("getInstallerPackageName") {
      val context = appContext.reactContext
      if (context == null) null else try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          context.packageManager.getInstallSourceInfo(context.packageName).installingPackageName
        } else {
          @Suppress("DEPRECATION")
          context.packageManager.getInstallerPackageName(context.packageName)
        }
      } catch (_: Exception) {
        null
      }
    }

    AsyncFunction("openStore") { store: String ->
      val context = appContext.reactContext
      val packageName = when (store) {
        "google-play" -> "com.android.vending"
        "rustore" -> "ru.vk.store"
        else -> null
      }
      if (context == null || packageName == null) false else try {
        val url = if (store == "google-play") {
          "market://details?id=${context.packageName}"
        } else {
          "https://www.rustore.ru/catalog/app/${context.packageName}"
        }
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))
          .setPackage(packageName)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
      } catch (_: Exception) {
        false
      }
    }
  }
}
