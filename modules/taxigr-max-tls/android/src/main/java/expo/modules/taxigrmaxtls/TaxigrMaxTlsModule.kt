package expo.modules.taxigrmaxtls

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URI
import java.security.KeyStore
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

class TaxigrMaxTlsModule : Module() {
  private val calls = ConcurrentHashMap<String, Call>()
  private val cancelled = mutableSetOf<String>()
  private val client by lazy {
    val context = appContext.reactContext ?: throw IllegalStateException("MAX_CONTEXT_UNAVAILABLE")
    val certificate = context.resources.openRawResource(R.raw.taxigr_max_root).use {
      CertificateFactory.getInstance("X.509").generateCertificate(it)
    }
    val extraStore = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null); setCertificateEntry("max-root", certificate) }
    fun manager(store: KeyStore?): X509TrustManager = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(store) }.trustManagers.filterIsInstance<X509TrustManager>().single()
    val system = manager(null)
    val extra = manager(extraStore)
    val trust = object : X509TrustManager {
      override fun getAcceptedIssuers(): Array<X509Certificate> = system.acceptedIssuers + extra.acceptedIssuers
      override fun checkClientTrusted(chain: Array<X509Certificate>, type: String) = system.checkClientTrusted(chain, type)
      override fun checkServerTrusted(chain: Array<X509Certificate>, type: String) {
        try { system.checkServerTrusted(chain, type) }
        catch (_: CertificateException) { extra.checkServerTrusted(chain, type) }
      }
    }
    val tls = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trust), null) }
    OkHttpClient.Builder().sslSocketFactory(tls.socketFactory, trust)
      // Keep OkHttp's hostname verification. Never follow a redirect with a bot token.
      .followRedirects(false).followSslRedirects(false)
      .callTimeout(10, TimeUnit.SECONDS).build()
  }
  override fun definition() = ModuleDefinition {
    Name("TaxigrMaxTls")
    AsyncFunction("request") { id: String, url: String, method: String, headers: Map<String, String>, body: String? ->
      val target = URI(url)
      require(target.scheme == "https" && target.host == "platform-api2.max.ru" && target.port in listOf(-1,443) && target.userInfo == null && target.fragment == null) { "MAX_TLS_HOST_DENIED" }
      require(method in listOf("GET","POST","PUT","PATCH","DELETE")) { "MAX_TLS_METHOD_DENIED" }
      val payload = if (method in listOf("POST","PUT","PATCH")) (body ?: "{}").toRequestBody("application/json".toMediaType()) else null
      val request = Request.Builder().url(url).method(method, payload).apply { headers.forEach { (name,value) -> header(name,value) } }.build()
      val call = client.newCall(request)
      synchronized(calls) {
        check(!cancelled.remove(id)) { "MAX_TLS_REQUEST_CANCELLED" }
        check(calls.putIfAbsent(id,call) == null) { "MAX_TLS_DUPLICATE_REQUEST" }
      }
      try {
        call.execute().use { response ->
          val text = response.body?.string() ?: ""
          check(text.length <= 2_000_000) { "MAX_TLS_RESPONSE_TOO_LARGE" }
          mapOf("status" to response.code, "body" to text)
        }
      } finally { calls.remove(id) }
    }
    Function("cancel") { id: String ->
      synchronized(calls) {
        val call = calls[id]
        if (call != null) call.cancel() else { if (cancelled.size > 1024) cancelled.clear(); cancelled.add(id) }
      }
      Unit
    }
    OnDestroy { synchronized(calls) { calls.values.forEach { it.cancel() }; calls.clear(); cancelled.clear() } }
  }
}
