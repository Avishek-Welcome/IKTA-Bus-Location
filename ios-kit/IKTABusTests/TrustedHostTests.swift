import XCTest
@testable import IKTABus

final class TrustedHostTests: XCTestCase {
    func testOwnSitesAreTrusted() {
        XCTAssertTrue(WebViewController.isTrusted(URL(string: "https://ikta-bus.web.app/driver.html")))
        XCTAssertTrue(WebViewController.isTrusted(URL(string: "https://IKTA-BUS.firebaseapp.com/")))
    }

    func testOtherSitesAndPlainHttpAreNot() {
        XCTAssertFalse(WebViewController.isTrusted(URL(string: "http://ikta-bus.web.app/")))
        XCTAssertFalse(WebViewController.isTrusted(URL(string: "https://ikta-bus.web.app.evil.com/")))
        XCTAssertFalse(WebViewController.isTrusted(URL(string: "tel:100")))
        XCTAssertFalse(WebViewController.isTrusted(nil))
    }
}
