import CoreLocation
import UIKit
import UserNotifications
import WebKit

/// Shows https://ikta-bus.web.app full screen, so every website update reaches the app with no
/// new build. Like the Android app, it gives the site the phone's own GPS, notifications and
/// screen-on through window.IKTAApp, which js/app-bridge.js picks up.
final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, CLLocationManagerDelegate {
    static let home = URL(string: "https://ikta-bus.web.app/")!
    static let hosts: Set<String> = ["ikta-bus.web.app", "ikta-bus.firebaseapp.com", "avishek-welcome.github.io"]

    private var web: WKWebView!
    private let location = CLLocationManager()
    private var wantLocation = false
    private var sharing = false
    private var notifyState = "default"

    private var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
    }

    // ---------- Setup ----------
    override func loadView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = [] // arrival sounds
        config.applicationNameForUserAgent = "Mobile/15E148 IKTABusApp/\(version)"
        config.userContentController.add(WeakHandler(self), name: "ikta")

        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        web.scrollView.contentInsetAdjustmentBehavior = .never // the site pads itself with env(safe-area-inset-*)
        web.isOpaque = false
        web.backgroundColor = UIColor(named: "LaunchBackground")
        view = web
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        location.delegate = self
        location.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        location.distanceFilter = kCLDistanceFilterNone
        location.activityType = .automotiveNavigation
        location.pausesLocationUpdatesAutomatically = false
        installBridge()
        refreshNotificationPermission()
        web.load(URLRequest(url: Self.home))
    }

    /// window.IKTAApp, defined before the page's own scripts run. Calls go to native code as
    /// messages; the notification permission is kept in the page so it can be read at once.
    private func installBridge() {
        let source = """
        (function () {
          var post = function (m, a) { window.webkit.messageHandlers.ikta.postMessage({ m: m, a: a || [] }); };
          var perm = \(quote(notifyState));
          window.IKTAApp_setNotifyPermission = function (p) { perm = p; };
          window.IKTAApp = {
            platform: 'ios',
            version: function () { return \(quote(version)); },
            startLocation: function () { post('startLocation'); },
            stopLocation: function () { post('stopLocation'); },
            setSharing: function (on) { post('setSharing', [!!on]); },
            keepScreenOn: function (on) { post('keepScreenOn', [!!on]); },
            notificationPermission: function () { return perm; },
            requestNotificationPermission: function () { post('requestNotificationPermission'); },
            notify: function (t, b, tag) { post('notify', [String(t), String(b || ''), String(tag || '')]); }
          };
        })();
        """
        let ucc = web.configuration.userContentController
        ucc.removeAllUserScripts()
        ucc.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }

    private func trusted(_ url: URL?) -> Bool {
        guard let url = url, url.scheme == "https", let host = url.host?.lowercased() else { return false }
        return Self.hosts.contains(host)
    }

    private func js(_ code: String) {
        web.evaluateJavaScript(code, completionHandler: nil)
    }

    private func quote(_ s: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: [s])
        let arr = data.flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"
        return String(arr.dropFirst().dropLast())
    }

    // ---------- Messages from window.IKTAApp ----------
    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, trusted(message.frameInfo.request.url),
              let body = message.body as? [String: Any], let m = body["m"] as? String else { return }
        let a = body["a"] as? [Any] ?? []
        switch m {
        case "startLocation": requestLocation()
        case "stopLocation":
            wantLocation = false
            if !sharing { location.stopUpdatingLocation() }
        case "setSharing":
            sharing = a.first as? Bool ?? false
            if sharing { requestLocation() } else if !wantLocation { location.stopUpdatingLocation() }
            keepScreenOn(sharing)
        case "keepScreenOn": keepScreenOn(a.first as? Bool ?? false)
        case "requestNotificationPermission": requestNotifications()
        case "notify":
            let s = a.compactMap { $0 as? String }
            if s.count == 3 { notify(title: s[0], body: s[1], tag: s[2]) }
        default: break
        }
    }

    private func keepScreenOn(_ on: Bool) {
        UIApplication.shared.isIdleTimerDisabled = on || sharing
    }

    // ---------- Location ----------
    private func requestLocation() {
        wantLocation = true
        switch location.authorizationStatus {
        case .notDetermined: location.requestWhenInUseAuthorization() // continues in the delegate below
        case .denied, .restricted: geoError(1, "Location is off for IKTA Bus. Turn it on in Settings → Privacy & Security → Location Services.")
        default: location.startUpdatingLocation()
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard wantLocation || sharing else { return }
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways: manager.startUpdatingLocation()
        case .denied, .restricted:
            wantLocation = false
            geoError(1, "Location access was not allowed")
        default: break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let l = locations.last, l.horizontalAccuracy >= 0 else { return }
        func num(_ v: Double, _ ok: Bool) -> String { ok ? String(format: "%.2f", locale: Locale(identifier: "en_US_POSIX"), v) : "null" }
        let json = String(format: "{\"lat\":%.7f,\"lng\":%.7f,\"acc\":%.1f,\"alt\":%@,\"speed\":%@,\"heading\":%@,\"ts\":%.0f}",
                          locale: Locale(identifier: "en_US_POSIX"),
                          l.coordinate.latitude, l.coordinate.longitude, l.horizontalAccuracy,
                          num(l.altitude, l.verticalAccuracy >= 0), num(l.speed, l.speed >= 0), num(l.course, l.course >= 0),
                          l.timestamp.timeIntervalSince1970 * 1000)
        js("window.IKTAApp_onFix&&IKTAApp_onFix(\(json))")
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let code = (error as? CLError)?.code
        if code == .locationUnknown { return } // still searching; more fixes follow
        if code == .denied { geoError(1, "Location access was not allowed") } else { geoError(2, error.localizedDescription) }
    }

    private func geoError(_ code: Int, _ msg: String) {
        js("window.IKTAApp_onGeoError&&IKTAApp_onGeoError(\(code),\(quote(msg)))")
    }

    // ---------- Notifications ----------
    func refreshNotificationPermission(then done: (() -> Void)? = nil) {
        UNUserNotificationCenter.current().getNotificationSettings { s in
            let state: String
            switch s.authorizationStatus {
            case .notDetermined: state = "default"
            case .denied: state = "denied"
            default: state = "granted"
            }
            DispatchQueue.main.async {
                if state != self.notifyState {
                    self.notifyState = state
                    self.installBridge() // so the next page starts with the right value
                    self.js("window.IKTAApp_setNotifyPermission&&IKTAApp_setNotifyPermission(\(self.quote(state)))")
                }
                done?()
            }
        }
    }

    private func requestNotifications() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
            DispatchQueue.main.async {
                self.refreshNotificationPermission {
                    self.js("window.IKTAApp_onNotifyPermission&&IKTAApp_onNotifyPermission(\(self.quote(self.notifyState)))")
                }
            }
        }
    }

    private func notify(title: String, body: String, tag: String) {
        let c = UNMutableNotificationContent()
        c.title = title
        c.body = body
        c.sound = .default
        let id = tag.isEmpty ? UUID().uuidString : tag // same tag replaces the earlier alert, as on the web
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: c, trigger: nil))
    }

    // ---------- Navigation ----------
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = action.request.url
        let scheme = url?.scheme?.lowercased() ?? ""
        if trusted(url) || ["about", "blob", "data"].contains(scheme) || action.targetFrame?.isMainFrame == false {
            decisionHandler(.allow)
            return
        }
        // Other sites, tel:, maps, WhatsApp… open in their own apps
        if let url = url { UIApplication.shared.open(url) }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        // A new page isn't sharing (driver.html tells us again if it starts)
        sharing = false
        wantLocation = false
        location.stopUpdatingLocation()
        keepScreenOn(false)
    }

    // target="_blank" links
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if trusted(url) { webView.load(action.request) } else { UIApplication.shared.open(url) }
        }
        return nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let e = error as NSError
        if e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled { return }
        let html = """
        <html><head><meta name=viewport content='width=device-width,initial-scale=1'></head>
        <body style='background:#070b17;color:#e8ecff;font-family:-apple-system,sans-serif;text-align:center;padding:30vh 24px 0'>
        <h2>No internet connection</h2><p style='opacity:.7'>IKTA Bus needs the internet to show live buses.</p>
        <p><a href='\(Self.home.absoluteString)' style='display:inline-block;margin-top:12px;padding:12px 28px;border-radius:24px;
        background:#2f5bff;color:#fff;text-decoration:none;font-weight:bold'>Try again</a></p></body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    // The site's own confirm()/alert() dialogs
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        a.addTextField { $0.text = defaultText }
        a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(a.textFields?.first?.text) })
        present(a, animated: true)
    }

    // The site asks for compass access itself (DeviceOrientationEvent.requestPermission)
    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView, requestDeviceOrientationAndMotionPermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(Self.hosts.contains(origin.host.lowercased()) ? .grant : .deny)
    }

    // Web content process crashed (memory pressure): reload rather than show a blank screen
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }
}

/// WKUserContentController holds its handlers strongly; this avoids a retain cycle.
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(ucc, didReceive: message)
    }
}
