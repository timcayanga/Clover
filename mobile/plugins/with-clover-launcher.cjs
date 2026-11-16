const { withAndroidManifest, withDangerousMod, withEntitlementsPlist, withInfoPlist, withXcodeProject } = require("expo/config-plugins");
const { copyFile, mkdir, readFile, readdir, writeFile } = require("node:fs/promises");
const path = require("node:path");

const actions = [
  { id: "expense", label: "Add Expense", appleIcon: "plus.circle", androidIcon: "ic_input_add" },
  { id: "receipt", label: "Scan Receipt", appleIcon: "camera", androidIcon: "ic_menu_camera" },
  { id: "transactions", label: "Transactions", appleIcon: "arrow.left.arrow.right", androidIcon: "ic_menu_agenda" },
  { id: "ask", label: "Ask Clover", appleIcon: "bubble.left", androidIcon: "ic_menu_help" },
];
const widget = "CloverQuickActions";
const androidNamespace = 'xmlns:android="http://schemas.android.com/apk/res/android"';
const widgetActions = [
  { id: "expense", label: "Add", icon: "add" },
  { id: "receipt", label: "Scan", icon: "scan" },
  { id: "transactions", label: "Transactions", icon: "transactions" },
  { id: "accounts", label: "Accounts", icon: "accounts" },
];
const artDir = path.join(__dirname, "launcher", "art");
const template = name => readFile(path.join(__dirname, "launcher", name), "utf8");
async function write(root, file, value) {
  const destination = path.join(root, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, value);
}

async function copy(root, destination, source) {
  const target = path.join(root, destination);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
}

function withAndroidLauncher(config, scheme, packageName) {
  config = withAndroidManifest(config, config => {
    const app = config.modResults.manifest.application[0];
    const launcher = app.activity.find(activity => activity["intent-filter"]?.some(filter =>
      filter.category?.some(category => category.$["android:name"] === "android.intent.category.LAUNCHER")));
    if (!launcher) throw new Error("Clover launcher activity is missing");
    const metadata = "android.app.shortcuts";
    launcher["meta-data"] = [
      ...(launcher["meta-data"] ?? []).filter(item => item.$["android:name"] !== metadata),
      { $: { "android:name": metadata, "android:resource": "@xml/clover_shortcuts" } },
    ];
    const receiver = ".CloverQuickActionsProvider";
    app.receiver = [
      ...(app.receiver ?? []).filter(item => item.$["android:name"] !== receiver),
      {
        $: { "android:name": receiver, "android:exported": "false", "android:label": "@string/clover_widget_name" },
        "intent-filter": [{ action: [{ $: { "android:name": "android.appwidget.action.APPWIDGET_UPDATE" } }] }],
        "meta-data": [{ $: { "android:name": "android.appwidget.provider", "android:resource": "@xml/clover_widget" } }],
      },
    ];
    return config;
  });
  return withDangerousMod(config, ["android", async config => {
    const root = path.join(config.modRequest.platformProjectRoot, "app/src/main");
    const resources = actions.map(action => `<string name="clover_action_${action.id}">${action.label}</string>`).join("\n");
    const shortcuts = actions.map(action => `
  <shortcut android:shortcutId="${action.id}" android:enabled="true" android:icon="@android:drawable/${action.androidIcon}"
    android:shortcutShortLabel="@string/clover_action_${action.id}">
    <intent android:action="android.intent.action.VIEW" android:data="${scheme}://launcher/${action.id}"
      android:targetPackage="${packageName}" android:targetClass="${packageName}.MainActivity" />
  </shortcut>`).join("");
    const tile = action => `
      <LinearLayout android:id="@+id/clover_${action.id}" android:layout_width="0dp" android:layout_height="match_parent"
        android:layout_weight="1" android:orientation="vertical" android:gravity="center" android:paddingHorizontal="1dp">
        <ImageView android:layout_width="36dp" android:layout_height="36dp" android:padding="9dp"
          android:background="@drawable/clover_widget_${action.id === "receipt" ? "mint" : "circle"}" android:src="@drawable/clover_art_${action.icon}" />
        <TextView android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="3dp"
          android:gravity="center" android:text="${action.label}" android:textSize="10sp" android:textColor="#000000"
          android:maxLines="1" android:ellipsize="end" android:fontFamily="@font/clover_poppins"
          android:autoSizeTextType="uniform" android:autoSizeMinTextSize="8sp" android:autoSizeMaxTextSize="10sp" android:autoSizeStepGranularity="1sp" />
      </LinearLayout>`;
    const shape = (color, radius) => `<shape ${androidNamespace}><solid android:color="${color}"/>
      <corners android:radius="${radius}dp"/><stroke android:width="1dp" android:color="#BCFFFFFF"/></shape>`;
    const artwork = ["mark", "add", "scan", "transactions", "accounts", "next", "waves_medium"];
    const provider = (await template("CloverQuickActionsProvider.java"))
      .replaceAll("__CLOVER_PACKAGE__", packageName).replaceAll("__CLOVER_SCHEME__", scheme);
    await Promise.all([
      copy(root, "res/font/clover_poppins.ttf", path.join(config.modRequest.projectRoot, "assets/fonts/Poppins-SemiBold.ttf")),
      ...artwork.map(name => copy(root, `res/drawable-nodpi/clover_art_${name}.png`, path.join(artDir, `${name}.png`))),
      write(root, `java/${packageName.replaceAll(".", "/")}/CloverQuickActionsProvider.java`, provider),
      write(root, "res/values/clover_launcher.xml", `<resources><string name="clover_widget_name">Clover Quick Actions</string>${resources}</resources>`),
      write(root, "res/xml/clover_shortcuts.xml", `<shortcuts ${androidNamespace}>${shortcuts}\n</shortcuts>`),
      write(root, "res/xml/clover_widget.xml", `<appwidget-provider ${androidNamespace}
        android:minWidth="224dp" android:minHeight="120dp" android:targetCellWidth="4" android:targetCellHeight="2"
        android:minResizeWidth="224dp" android:minResizeHeight="120dp" android:updatePeriodMillis="0" android:resizeMode="horizontal|vertical"
        android:initialLayout="@layout/clover_quick_actions" android:previewLayout="@layout/clover_quick_actions" android:widgetCategory="home_screen" />`),
      write(root, "res/drawable/clover_widget_background.xml", `<shape ${androidNamespace}>
        <gradient android:angle="0" android:startColor="#23B0C4" android:endColor="#4FD6D4"/>
        <corners android:radius="27dp"/><stroke android:width="1dp" android:color="#BCFFFFFF"/></shape>`),
      write(root, "res/drawable/clover_widget_circle.xml", shape("#F2FFFFFF", 24)),
      write(root, "res/drawable/clover_widget_mint.xml", shape("#ABFBD7", 24)),
      write(root, "res/drawable/clover_widget_pill.xml", shape("#F2FFFFFF", 30)),
      write(root, "res/layout/clover_quick_actions.xml", `<FrameLayout ${androidNamespace}
        android:layout_width="match_parent" android:layout_height="match_parent"
        android:clipToOutline="true" android:background="@drawable/clover_widget_background">
        <ImageView android:layout_width="match_parent" android:layout_height="52dp" android:layout_gravity="bottom"
          android:scaleType="centerCrop" android:src="@drawable/clover_art_waves_medium" android:importantForAccessibility="no"/>
        <LinearLayout android:layout_width="match_parent" android:layout_height="match_parent"
          android:orientation="vertical" android:padding="9dp" android:gravity="top">
          <LinearLayout android:id="@+id/clover_ask" android:layout_width="match_parent" android:layout_height="39dp"
            android:background="@drawable/clover_widget_pill" android:gravity="center_vertical" android:paddingHorizontal="9dp">
            <ImageView android:layout_width="19dp" android:layout_height="19dp" android:src="@drawable/clover_art_mark"/>
            <TextView android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1"
              android:layout_marginStart="7dp" android:text="Add your transaction" android:fontFamily="@font/clover_poppins" android:textColor="#000000" android:textSize="13sp" android:maxLines="1"/>
            <ImageView android:layout_width="12dp" android:layout_height="12dp" android:src="@drawable/clover_art_next"/>
          </LinearLayout>
          <LinearLayout android:layout_width="match_parent" android:layout_height="51dp" android:layout_marginTop="5dp"
            android:orientation="horizontal">${widgetActions.map(tile).join("")}</LinearLayout>
        </LinearLayout>
      </FrameLayout>`),
    ]);
    return config;
  }]);
}

function withAppleLauncher(config, scheme, bundleId) {
  const group = `group.${config.ios.bundleIdentifier}.widgets`;
  const entitlement = "com.apple.security.application-groups";
  config = withEntitlementsPlist(config, config => {
    config.modResults[entitlement] = [...new Set([...(config.modResults[entitlement] ?? []), group])];
    return config;
  });
  config = withInfoPlist(config, config => {
    config.modResults.CloverWidgetGroup = group;
    config.modResults.UIApplicationShortcutItems = actions.map(action => ({
      UIApplicationShortcutItemType: `ph.clover.launcher.${action.id}`,
      UIApplicationShortcutItemTitle: action.label,
      UIApplicationShortcutItemIconSymbolName: action.appleIcon,
    }));
    return config;
  });
  config = withXcodeProject(config, async config => {
    const art = await readdir(artDir);
    const resources = [...art, "Poppins-SemiBold.ttf"];
    const project = config.modResults;
    const objects = project.hash.project.objects;
    const host = project.getFirstTarget();
    const existing = Object.entries(objects.PBXNativeTarget).find(([, item]) =>
      item?.name === widget || item?.name === `"${widget}"`);
    let targetId = existing?.[0];
    let target = existing?.[1];
    if (!target) {
      // The Expo template has one target and may omit both dependency sections.
      objects.PBXContainerItemProxy ??= {};
      objects.PBXTargetDependency ??= {};
      const extension = project.addTarget(widget, "app_extension", widget, bundleId);
      target = extension.pbxNativeTarget;
      targetId = extension.uuid;
      project.addBuildPhase([], "PBXSourcesBuildPhase", "Sources", extension.uuid);
      const group = project.addPbxGroup([], widget, widget);
      project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup);
      if (!project.addSourceFile(`${widget}.swift`, { target: extension.uuid }, group.uuid)) {
        throw new Error("Clover WidgetKit source must be included in the extension");
      }
      const embed = host.firstTarget.buildPhases.find(phase => {
        const copy = objects.PBXCopyFilesBuildPhase?.[phase.value];
        return copy?.dstSubfolderSpec === 13 && copy.files.some(file =>
          objects.PBXBuildFile[file.value]?.fileRef === target.productReference);
      });
      if (!embed) throw new Error("Clover WidgetKit extension must be embedded in the host");
      embed.comment = "Embed Clover Widget";
      const embeddedProduct = objects.PBXCopyFilesBuildPhase[embed.value].files.find(file =>
        objects.PBXBuildFile[file.value]?.fileRef === target.productReference);
      objects.PBXBuildFile[embeddedProduct.value].settings = { ATTRIBUTES: ["RemoveHeadersOnCopy"] };
      objects.PBXCopyFilesBuildPhase[embed.value].name = '"Embed Clover Widget"';
      objects.PBXCopyFilesBuildPhase[`${embed.value}_comment`] = "Embed Clover Widget";
    }
    if (!target.buildPhases.some(phase => objects.PBXResourcesBuildPhase?.[phase.value])) {
      project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", targetId);
    }
    const groupId = project.findPBXGroupKey({ name: widget, path: widget });
    for (const name of resources) project.addResourceFile(name, { target: targetId }, groupId);
    const hostConfigs = objects.XCConfigurationList[host.firstTarget.buildConfigurationList].buildConfigurations;
    for (const { value } of objects.XCConfigurationList[target.buildConfigurationList].buildConfigurations) {
      const extensionConfig = objects.XCBuildConfiguration[value];
      const hostConfig = hostConfigs.map(ref => objects.XCBuildConfiguration[ref.value])
        .find(candidate => candidate.name === extensionConfig.name);
      const hostSettings = hostConfig.buildSettings;
      Object.assign(extensionConfig.buildSettings, {
        APPLICATION_EXTENSION_API_ONLY: "YES",
        CODE_SIGN_STYLE: "Automatic",
        CODE_SIGN_ENTITLEMENTS: `${widget}/${widget}.entitlements`,
        INFOPLIST_FILE: `${widget}/${widget}-Info.plist`,
        CURRENT_PROJECT_VERSION: config.ios?.buildNumber ?? hostSettings.CURRENT_PROJECT_VERSION ?? "1",
        DEVELOPMENT_TEAM: config.ios?.appleTeamId,
        IPHONEOS_DEPLOYMENT_TARGET: hostSettings.IPHONEOS_DEPLOYMENT_TARGET ?? "17.0",
        MARKETING_VERSION: config.version,
        PRODUCT_BUNDLE_IDENTIFIER: `"${bundleId}"`,
        SWIFT_VERSION: "5.0",
        VERSIONING_SYSTEM: "apple-generic",
        TARGETED_DEVICE_FAMILY: '"1,2"',
      });
    }
    return config;
  });
  return withDangerousMod(config, ["ios", async config => {
    const root = config.modRequest.platformProjectRoot;
    const swift = (await template(`${widget}.swift`)).replaceAll("__CLOVER_SCHEME__", scheme).replaceAll("__CLOVER_GROUP__", group);
    await Promise.all([
      ...(await readdir(artDir)).map(name => copy(root, `${widget}/${name}`, path.join(artDir, name))),
      copy(root, `${widget}/Poppins-SemiBold.ttf`, path.join(config.modRequest.projectRoot, "assets/fonts/Poppins-SemiBold.ttf")),
      write(root, `${widget}/${widget}.entitlements`, `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>${entitlement}</key><array><string>${group}</string></array></dict></plist>`),
      write(root, `${widget}/${widget}.swift`, swift),
      write(root, `${widget}/${widget}-Info.plist`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDisplayName</key><string>Clover</string>
<key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
<key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
<key>CFBundleName</key><string>$(PRODUCT_NAME)</string>
<key>CFBundlePackageType</key><string>XPC!</string>
<key>CFBundleShortVersionString</key><string>$(MARKETING_VERSION)</string>
<key>CFBundleVersion</key><string>$(CURRENT_PROJECT_VERSION)</string>
<key>UIAppFonts</key><array><string>Poppins-SemiBold.ttf</string></array>
<key>NSExtension</key><dict><key>NSExtensionPointIdentifier</key><string>com.apple.widgetkit-extension</string></dict>
</dict></plist>`),
    ]);
    return config;
  }]);
}

module.exports = config => {
  const scheme = config.scheme;
  const packageName = config.android?.package;
  const iosBundle = config.ios?.bundleIdentifier;
  if (!["clover", "clover-preview"].includes(scheme) || !packageName || !iosBundle) {
    throw new Error("Clover launcher requires a registered scheme and native identifiers");
  }
  return withAppleLauncher(withAndroidLauncher(config, scheme, packageName), scheme, `${iosBundle}.QuickActions`);
};
