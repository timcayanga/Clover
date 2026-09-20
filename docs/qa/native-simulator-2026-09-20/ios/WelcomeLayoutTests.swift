import XCTest
final class CloverUIQA: XCTestCase {
 func snap(_ app: XCUIApplication, _ name: String) { let a = XCTAttachment(screenshot: app.screenshot()); a.name=name; a.lifetime = .keepAlways; add(a) }
 func testWelcome() {
  continueAfterFailure=false
  let app = XCUIApplication(bundleIdentifier: "ph.clover.preview")
  let spring = XCUIApplication(bundleIdentifier: "com.apple.springboard")
  if spring.buttons["Open"].exists { spring.buttons["Open"].tap() }
  app.activate()
  if app.buttons["Explore Clover"].waitForExistence(timeout:10) { app.buttons["Explore Clover"].tap() }
  XCTAssertTrue(app.buttons["Next"].waitForExistence(timeout: 45))
  for i in 1...4 {
   let progress=app.staticTexts["\(i) of 4 · Swipe to explore"].firstMatch
   XCTAssertTrue(progress.waitForExistence(timeout: 5))
   XCTAssertTrue(app.buttons["Sign up"].isHittable)
   XCTAssertTrue(app.buttons["Log in"].isHittable)
   let next=app.buttons[i == 4 ? "Get started" : "Next"]
   XCTAssertTrue(next.isHittable)
   let titles=["Your money,\nall together.","Less typing.\nMore clarity.","Make room for\nwhat matters.","Meet your money\ncompanion."]
   let title=app.staticTexts[titles[i-1]].firstMatch
   XCTAssertTrue(title.exists)
   XCTAssertLessThanOrEqual(title.frame.maxY, progress.frame.minY - 35)
   snap(app,"Compact-welcome-\(i)")
   next.tap()
  }
  XCTAssertTrue(app.buttons["Explore Clover"].waitForExistence(timeout: 5))
 }
}
