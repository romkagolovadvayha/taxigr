import ExpoModulesCore
import Foundation
import Security

private final class MaxTrustDelegate: NSObject, URLSessionTaskDelegate {
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                  newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
  }
  func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
                  completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust else {
      completionHandler(.performDefaultHandling, nil); return
    }
    guard challenge.protectionSpace.host == "platform-api2.max.ru",
          let trust = challenge.protectionSpace.serverTrust,
          let bundleURL = Bundle(for: TaxigrMaxTlsModule.self).url(forResource: "TaxigrMaxTls", withExtension: "bundle"),
          let bundle = Bundle(url: bundleURL),
          let url = bundle.url(forResource: "taxigr_max_root", withExtension: "cer"),
          let bytes = try? Data(contentsOf: url),
          let anchor = SecCertificateCreateWithData(nil, bytes as CFData) else {
      completionHandler(.cancelAuthenticationChallenge, nil); return
    }
    // Check the full chain, expiration and exact hostname against system roots plus
    // the published MAX root. This does not change device trust or other sessions.
    guard SecTrustSetPolicies(trust, SecPolicyCreateSSL(true, "platform-api2.max.ru" as CFString)) == errSecSuccess,
          SecTrustSetAnchorCertificates(trust, [anchor] as CFArray) == errSecSuccess,
          SecTrustSetAnchorCertificatesOnly(trust, false) == errSecSuccess,
          SecTrustEvaluateWithError(trust, nil) else {
      completionHandler(.cancelAuthenticationChallenge, nil); return
    }
    completionHandler(.useCredential, URLCredential(trust: trust))
  }
}

public final class TaxigrMaxTlsModule: Module {
  private let lock = NSLock()
  private var tasks: [String: URLSessionDataTask] = [:]
  private var cancelled: Set<String> = []
  public func definition() -> ModuleDefinition {
    Name("TaxigrMaxTls")
    AsyncFunction("request") { (id: String, address: String, method: String, headers: [String:String], body: String?, promise: Promise) in
      guard let url = URL(string: address), url.scheme == "https", url.host == "platform-api2.max.ru",
            url.port == nil || url.port == 443, url.user == nil, url.password == nil, url.fragment == nil,
            ["GET","POST","PUT","PATCH","DELETE"].contains(method) else {
        promise.reject("MAX_TLS_HOST_DENIED", "Недопустимый адрес MAX"); return
      }
      var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10)
      request.httpMethod = method
      request.allHTTPHeaderFields = headers
      request.httpBody = body?.data(using: .utf8)
      let config = URLSessionConfiguration.ephemeral
      config.urlCache = nil; config.httpCookieStorage = nil; config.timeoutIntervalForResource = 10
      let session = URLSession(configuration: config, delegate: MaxTrustDelegate(), delegateQueue: nil)
      let task = session.dataTask(with: request) { data, response, error in
        self.lock.lock(); self.tasks.removeValue(forKey: id); self.lock.unlock()
        defer { session.finishTasksAndInvalidate() }
        if error != nil { promise.reject("MAX_TLS_REQUEST_FAILED", "Ошибка соединения с MAX"); return }
        guard let response = response as? HTTPURLResponse, let data = data, data.count <= 2_000_000,
              let text = String(data: data, encoding: .utf8) else {
          promise.reject("MAX_TLS_RESPONSE_INVALID", "Некорректный ответ MAX"); return
        }
        promise.resolve(["status": response.statusCode, "body": text])
      }
      self.lock.lock()
      if self.cancelled.remove(id) != nil { self.lock.unlock(); session.invalidateAndCancel(); promise.reject("MAX_TLS_REQUEST_CANCELLED", "Запрос отменён"); return }
      if self.tasks[id] != nil { self.lock.unlock(); session.invalidateAndCancel(); promise.reject("MAX_TLS_DUPLICATE_REQUEST", "Повторный запрос"); return }
      self.tasks[id] = task; self.lock.unlock(); task.resume()
    }
    Function("cancel") { (id: String) in
      self.lock.lock(); let task = self.tasks[id]
      if task == nil { if self.cancelled.count > 1024 { self.cancelled.removeAll() }; self.cancelled.insert(id) }
      self.lock.unlock(); task?.cancel()
    }
    OnDestroy {
      self.lock.lock(); let pending = Array(self.tasks.values); self.tasks.removeAll(); self.cancelled.removeAll(); self.lock.unlock()
      pending.forEach { $0.cancel() }
    }
  }
}
