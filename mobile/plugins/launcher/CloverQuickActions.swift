import AppIntents
import SwiftUI
import WidgetKit

private let group = "__CLOVER_GROUP__"
private let scheme = "__CLOVER_SCHEME__"
private let whiteGlass = Color.white.opacity(0.94)
private let mint = Color(red: 0.67, green: 0.98, blue: 0.84)
private let ink = Color.black
private let subdued = Color(red: 0.08, green: 0.26, blue: 0.31)

struct WidgetAccount: Codable {
  let id: String
  let name: String
  let currency: String
  let balance: String
  let isBPI: Bool
}

struct WidgetSnapshot: Codable {
  let workspace: String
  let currency: String
  let total: String
  let accounts: [WidgetAccount]
  let defaultAccountId: String?
}

enum TransactionType: String, CaseIterable, Codable {
  case income, expense, transfer
}

struct WidgetDraft: Codable {
  var type: TransactionType = .expense
  var category: String?
  var amount = ""

  mutating func append(_ key: String) {
    if key == "C" { amount = ""; return }
    if key == "erase" { if !amount.isEmpty { amount.removeLast() }; return }
    if key == "." {
      if !amount.contains(".") { amount += amount.isEmpty ? "0." : "." }
      return
    }
    guard ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "000"].contains(key) else { return }
    if let decimal = amount.firstIndex(of: ".") {
      amount += String(key.prefix(max(0, 2 - amount.distance(from: decimal, to: amount.endIndex) + 1)))
    } else {
      let digits = String((amount + key).drop(while: { $0 == "0" }))
      if digits.count <= 12 { amount = digits.isEmpty ? "0" : digits }
    }
  }
}

enum WidgetState {
  static var defaults: UserDefaults? { UserDefaults(suiteName: group) }

  static var snapshot: WidgetSnapshot? {
    guard let defaults, let savedAt = defaults.object(forKey: "snapshotDate") as? Date,
          Date().timeIntervalSince(savedAt) < 86_400,
          let data = defaults.string(forKey: "snapshot")?.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
  }

  static var draft: WidgetDraft {
    guard let data = defaults?.data(forKey: "draft"),
          let saved = try? JSONDecoder().decode(WidgetDraft.self, from: data) else { return WidgetDraft() }
    return saved
  }

  static var balanceIndex: Int { defaults?.integer(forKey: "balanceIndex") ?? 0 }
}

struct EditCloverWidget: AppIntent {
  static var title: LocalizedStringResource = "Update Clover Widget"
  static var isDiscoverable = false

  @Parameter(title: "Control") var control: String
  @Parameter(title: "Value") var value: String

  init() {}
  init(_ control: String, _ value: String) { self.control = control; self.value = value }

  @MainActor func perform() async throws -> some IntentResult {
    guard let defaults = WidgetState.defaults else { return .result() }
    let accountCount = WidgetState.snapshot?.accounts.count ?? 0
    if control == "balance" {
      let count = accountCount + 1
      let step = value == "next" ? 1 : -1
      defaults.set((max(0, WidgetState.balanceIndex) % count + step + count) % count, forKey: "balanceIndex")
      return .result()
    }
    var draft = WidgetState.draft
    switch control {
    case "type":
      if let type = TransactionType(rawValue: value), draft.type != type { draft.type = type; draft.category = nil }
    case "category":
      if draft.type == .expense && WidgetCategory.allCases.contains(where: { $0.title == value }) {
        draft.category = draft.category == value ? nil : value
      }
    case "key": draft.append(value)
    default: return .result()
    }
    defaults.set(try JSONEncoder().encode(draft), forKey: "draft")
    return .result()
  }
}

enum WidgetCategory: String, CaseIterable {
  case food, groceries, transport, bills
  var title: String {
    switch self {
    case .food: "Food & Dining"
    case .groceries: "Groceries"
    case .transport: "Transport"
    case .bills: "Bills & Utilities"
    }
  }
  var label: String {
    switch self {
    case .food: "Food"
    case .groceries: "Grocery"
    case .transport: "Transport"
    case .bills: "Bills"
    }
  }
  var color: Color {
    switch self {
    case .food, .groceries: Color(red: 0.99, green: 0.73, blue: 0.45)
    case .transport: Color(red: 0.73, green: 0.90, blue: 0.99)
    case .bills: Color(red: 0.98, green: 0.8, blue: 0.08)
    }
  }
}

struct CloverQuickEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
  let draft: WidgetDraft
  let balanceIndex: Int
}

struct CloverQuickProvider: TimelineProvider {
  func placeholder(in context: Context) -> CloverQuickEntry {
    CloverQuickEntry(date: .now, snapshot: nil, draft: WidgetDraft(), balanceIndex: 0)
  }
  func getSnapshot(in context: Context, completion: @escaping (CloverQuickEntry) -> Void) {
    completion(context.isPreview ? placeholder(in: context) : entry())
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<CloverQuickEntry>) -> Void) {
    completion(Timeline(entries: [entry()], policy: .after(.now.addingTimeInterval(900))))
  }
  private func entry() -> CloverQuickEntry {
    CloverQuickEntry(date: .now, snapshot: WidgetState.snapshot, draft: WidgetState.draft, balanceIndex: WidgetState.balanceIndex)
  }
}

enum CloverWidgetKind: String, CaseIterable {
  case quickActions = "CloverQuickActions"
  case addScan = "CloverAddScan"
  case quickLog = "CloverQuickLog"
  case transaction = "CloverTransaction"
  case balance = "CloverBalance"

  var title: String {
    switch self {
    case .quickActions: "Quick Actions"
    case .addScan: "Add & Scan"
    case .quickLog: "Quick Log"
    case .transaction: "Add Transaction"
    case .balance: "My Balance"
    }
  }
  var family: WidgetFamily {
    switch self {
    case .addScan, .quickLog: .systemSmall
    case .quickActions, .balance: .systemMedium
    case .transaction: .systemLarge
    }
  }
}

struct CloverWidgetView: View {
  let kind: CloverWidgetKind
  let entry: CloverQuickEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.widgetRenderingMode) private var renderingMode

  private func destination(_ action: String, _ values: [String: String] = [:]) -> URL {
    var parts = URLComponents()
    parts.scheme = scheme
    parts.host = "launcher"
    parts.path = "/\(action)"
    if !values.isEmpty { parts.queryItems = values.sorted(by: { $0.key < $1.key }).map { URLQueryItem(name: $0.key, value: $0.value) } }
    return parts.url!
  }

  private func icon(_ name: String, _ size: CGFloat = 17) -> some View {
    Image(uiImage: Bundle.main.url(forResource: name, withExtension: "png").flatMap { UIImage(contentsOfFile: $0.path) } ?? UIImage())
      .resizable().scaledToFit().frame(width: size, height: size)
      .accessibilityHidden(true)
  }

  private func word(_ title: String, size: CGFloat = 11, color: Color = ink) -> some View {
    Text(title).font(.custom("Poppins-SemiBold", size: size))
      .foregroundStyle(renderingMode == .fullColor ? color : .primary)
      .lineLimit(1).minimumScaleFactor(0.68)
  }

  private func pill(_ title: String, action: String, tall: Bool) -> some View {
    Link(destination: destination(action)) {
      HStack(spacing: 6) {
        icon("mark", tall ? 20 : 18)
        word(title, size: tall ? 13 : 12)
        Spacer(minLength: 0)
        if tall { icon("next", 12) }
      }
      .padding(.horizontal, 10).frame(height: tall ? 44 : 33)
      .background(whiteGlass, in: Capsule())
      .overlay(Capsule().strokeBorder(Color.white.opacity(0.76), lineWidth: 1))
    }
  }

  private func action(_ title: String, _ route: String, _ asset: String, small: Bool = false, color: Color = whiteGlass) -> some View {
    Link(destination: destination(route)) {
      VStack(spacing: small ? 2 : 3) {
        if small {
          icon(asset, 14)
        } else {
          icon(asset, 17).frame(width: 36, height: 36)
            .background(color, in: Circle())
            .overlay(Circle().strokeBorder(.white.opacity(0.7), lineWidth: 1))
        }
        word(title, size: small ? 9 : 10)
      }
      .frame(maxWidth: .infinity, maxHeight: small ? .infinity : nil)
      .background(small ? color : .clear, in: RoundedRectangle(cornerRadius: 15))
      .contentShape(Rectangle())
    }
    .accessibilityLabel(title == "Scan" ? "Scan receipt" : title)
  }

  private var addScan: some View {
    VStack(spacing: 7) {
      pill("Add", action: "expense", tall: false)
      Spacer(minLength: 0)
      HStack(spacing: 5) {
        action("Add", "expense", "add", small: true)
        action("Scan", "receipt", "scan", small: true, color: mint)
      }.frame(height: 51)
    }
  }

  private var quickLog: some View {
    VStack(spacing: 5) {
      pill("Add", action: "expense", tall: false)
      HStack(spacing: 5) {
        action("Income", "income", "income", small: true)
        action("Expense", "expense", "expense", small: true)
      }
      HStack(spacing: 5) {
        action("Transfer", "transfer", "transfer", small: true)
        action("Scan", "receipt", "scan", small: true, color: mint)
      }
    }
  }

  private var quickActions: some View {
    VStack(spacing: 8) {
      pill("Add your transaction", action: "ask", tall: true)
      HStack(spacing: 3) {
        action("Add", "expense", "add")
        action("Scan", "receipt", "scan", color: mint)
        action("Transactions", "transactions", "transactions")
        action("Accounts", "accounts", "accounts")
      }
      Spacer(minLength: 0)
    }
  }

  private var balanceAccount: WidgetAccount? {
    guard let accounts = entry.snapshot?.accounts, entry.balanceIndex > 0,
          entry.balanceIndex <= accounts.count else { return nil }
    return accounts[entry.balanceIndex - 1]
  }

  private func arrow(_ direction: String, _ asset: String, label: String) -> some View {
    Button(intent: EditCloverWidget("balance", direction)) {
      icon(asset, 12).frame(width: 28, height: 27)
        .background(.white.opacity(0.72), in: Circle())
    }.buttonStyle(.plain).accessibilityLabel(label)
      .disabled(entry.snapshot?.accounts.isEmpty ?? true)
  }

  private func openAccount(_ account: WidgetAccount?) -> URL {
    guard let account, let workspace = entry.snapshot?.workspace else { return destination("accounts") }
    return destination("accounts", ["accountId": account.id, "workspace": workspace])
  }

  private var balance: some View {
    HStack(spacing: 7) {
      VStack(alignment: .leading, spacing: 5) {
        HStack(spacing: 7) {
          icon(balanceAccount.map { $0.isBPI ? "bpi" : "accounts" } ?? "mark", 19)
            .frame(width: 30, height: 30).background(mint.opacity(0.35), in: RoundedRectangle(cornerRadius: 8))
          word(balanceAccount?.name ?? "My Balance", size: 11, color: balanceAccount == nil ? subdued : ink)
            .privacySensitive()
        }
        word(balanceAccount?.balance ?? entry.snapshot?.total ?? "—", size: 17).privacySensitive()
        Spacer(minLength: 0)
        ZStack(alignment: .trailing) {
          HStack(spacing: 5) {
            arrow("previous", "previous", label: "Previous balance")
            arrow("next", "next", label: "Next balance")
          }.frame(maxWidth: .infinity)
          Link(destination: openAccount(balanceAccount)) {
            icon("open", 13).frame(width: 28, height: 28).background(.white, in: Circle())
          }.accessibilityLabel(balanceAccount == nil ? "Open Accounts" : "Open selected account")
        }
      }
      .padding(9).frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(whiteGlass, in: RoundedRectangle(cornerRadius: 20))
      VStack(spacing: 4) {
        HStack(spacing: 2) {
          action("Income", "income", "income")
          action("Expense", "expense", "expense")
        }
        HStack(spacing: 2) {
          action("Transfer", "transfer", "transfer")
          action("Scan", "receipt", "scan", color: mint)
        }
      }.frame(width: 104)
    }
  }

  private var transactionAccount: WidgetAccount? {
    guard let snapshot = entry.snapshot else { return nil }
    return snapshot.accounts.first { $0.id == snapshot.defaultAccountId }
  }

  private func draftLink(panel: String? = nil) -> URL {
    var values = ["type": entry.draft.type.rawValue, "amount": entry.draft.amount]
    values["category"] = entry.draft.category
    values["panel"] = panel
    if let account = transactionAccount {
      values["accountId"] = account.id
      values["workspace"] = entry.snapshot?.workspace
    }
    return destination("draft", values)
  }

  private func key(_ value: String, height: CGFloat) -> some View {
    Button(intent: EditCloverWidget("key", value)) {
      Group {
        if value == "erase" { Image(systemName: "delete.left").font(.system(size: 14, weight: .semibold)).foregroundStyle(ink) }
        else { word(value, size: 14) }
      }
      .frame(maxWidth: .infinity).frame(height: height)
      .background(whiteGlass, in: RoundedRectangle(cornerRadius: 16))
    }.buttonStyle(.plain).accessibilityLabel(value == "erase" ? "Delete digit" : value == "C" ? "Clear amount" : value)
  }

  private var transaction: some View {
    GeometryReader { geometry in
      let keyHeight = max(28, min(48, (geometry.size.height - 157) / 4))
      VStack(spacing: 6) {
        HStack(spacing: 1) {
          Link(destination: destination("ask")) { icon("mark", 22).frame(width: 30, height: 36) }.accessibilityLabel("Ask Clover")
          ForEach(TransactionType.allCases, id: \.self) { type in
            Button(intent: EditCloverWidget("type", type.rawValue)) {
              HStack(spacing: 2) {
                icon(type.rawValue, 12)
                word(type.rawValue.capitalized, size: 11, color: entry.draft.type == type ? ink : subdued)
              }
              .frame(maxWidth: .infinity).frame(height: 36)
              .background(entry.draft.type == type ? whiteGlass : .clear, in: Capsule())
            }.buttonStyle(.plain)
              .accessibilityAddTraits(entry.draft.type == type ? .isSelected : [])
          }
        }.background(.white.opacity(0.52), in: Capsule())
        HStack(spacing: 3) {
          if entry.draft.type == .expense {
            ForEach(WidgetCategory.allCases, id: \.self) { category in
              Button(intent: EditCloverWidget("category", category.title)) {
                VStack(spacing: 2) {
                  icon(category.rawValue, 17).frame(width: 27, height: 27)
                    .background(category.color, in: Circle())
                    .overlay(Circle().strokeBorder(.white, lineWidth: entry.draft.category == category.title ? 2 : 0))
                  word(category.label, size: 9)
                }.frame(maxWidth: .infinity)
              }.buttonStyle(.plain).accessibilityLabel(category.title)
                .accessibilityAddTraits(entry.draft.category == category.title ? .isSelected : [])
            }
            Link(destination: draftLink(panel: "category")) {
              VStack(spacing: 2) {
                icon("next", 12).frame(width: 27, height: 27).background(whiteGlass, in: Circle())
                word("See More", size: 9)
              }.frame(maxWidth: .infinity)
            }.accessibilityLabel("See more categories")
          } else {
            word(entry.draft.type == .income ? "Income" : "Transfer", size: 11).frame(maxWidth: .infinity, minHeight: 40)
          }
        }.frame(height: 42)
        HStack(spacing: 5) {
          Link(destination: draftLink(panel: "account")) {
            HStack(spacing: 5) {
              icon("accounts", 15).frame(width: 30, height: 30).background(mint, in: Circle())
              VStack(alignment: .leading, spacing: 0) {
                word("Account", size: 9, color: subdued)
                word(transactionAccount?.name ?? "Choose", size: 11).layoutPriority(1)
              }
              icon("down", 11)
            }
          }.accessibilityLabel("Choose transaction account")
          Spacer(minLength: 0)
          let formatted = entry.draft.amount.isEmpty ? "0.00" : entry.draft.amount
          let currency = transactionAccount?.currency ?? entry.snapshot?.currency ?? ""
          word(currency.isEmpty ? formatted : "\(currency) \(formatted)", size: 18)
            .accessibilityLabel("Amount \(formatted)")
        }.padding(.horizontal, 8).frame(height: 41).background(whiteGlass, in: Capsule())
        HStack(spacing: 5) {
          VStack(spacing: 5) {
            ForEach([["7", "8", "9"], ["4", "5", "6"], ["1", "2", "3"], ["0", "000", "."]], id: \.self) { row in
              HStack(spacing: 5) { ForEach(row, id: \.self) { key($0, height: keyHeight) } }
            }
          }
          VStack(spacing: 5) {
            key("erase", height: keyHeight)
            key("C", height: keyHeight)
            Link(destination: draftLink()) {
              word("SAVE", size: 12)
                .frame(maxWidth: .infinity).frame(height: keyHeight * 2 + 5)
                .background(mint, in: RoundedRectangle(cornerRadius: 16))
            }.accessibilityLabel("Review and save transaction")
          }.frame(width: (geometry.size.width - 15) / 4)
        }
      }.frame(maxHeight: .infinity)
    }
  }

  @ViewBuilder private var content: some View {
    switch kind {
    case .addScan: addScan
    case .quickLog: quickLog
    case .quickActions:
      if family == .systemSmall { addScan } else { quickActions }
    case .balance: balance
    case .transaction: transaction
    }
  }

  var body: some View {
    content.padding(family == .systemSmall ? 9 : 11)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .containerBackground(for: .widget) {
        GeometryReader { size in
          let waves = family == .systemSmall ? "waves_small" : family == .systemLarge ? "waves_large" : "waves_medium"
          LinearGradient(colors: [Color(red: 0.14, green: 0.69, blue: 0.77), Color(red: 0.31, green: 0.84, blue: 0.83)], startPoint: .leading, endPoint: .trailing)
            .overlay(alignment: .bottom) { icon(waves, size.size.width * 1.05).frame(height: size.size.height * 0.54).offset(y: size.size.height * 0.10) }
        }
        .overlay(ContainerRelativeShape().strokeBorder(.white.opacity(0.7), lineWidth: 1))
      }
  }
}

struct CloverWidget: Widget {
  let kind: CloverWidgetKind

  init() { kind = .quickActions }
  init(kind: CloverWidgetKind) { self.kind = kind }

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind.rawValue, provider: CloverQuickProvider()) { entry in
      CloverWidgetView(kind: kind, entry: entry)
    }
    .configurationDisplayName(kind.title)
    .description(kind == .balance ? "Browse your active Profile’s balances." : "Open Clover or start a transaction from your Home Screen.")
    .supportedFamilies(kind == .quickActions ? [.systemSmall, .systemMedium] : [kind.family])
    .contentMarginsDisabled()
  }
}

@main
struct CloverQuickActions: WidgetBundle {
  var body: some Widget {
    CloverWidget(kind: .addScan)
    CloverWidget(kind: .quickLog)
    CloverWidget(kind: .quickActions)
    CloverWidget(kind: .transaction)
    CloverWidget(kind: .balance)
  }
}
