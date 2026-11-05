// Run after Android Gradle has resolved release dependencies. No APK/AAB is built.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const cache = join(process.env.GRADLE_USER_HOME || join(homedir(), ".gradle"), "caches/modules-2/files-2.1");
function artifact(group, name, version, suffix) {
  const root = join(cache, group, name, version);
  assert(existsSync(root), `Resolve ${group}:${name}:${version} with Gradle first`);
  const files = readdirSync(root).flatMap(hash => readdirSync(join(root, hash)).map(file => join(root, hash, file)));
  const file = files.find(file => file.endsWith(suffix));
  assert(file, `Missing cached artifact: ${name} ${suffix}`);
  return file;
}
const artifacts = [
  artifact("com.clerk", "clerk-android-api", "1.4.1", ".aar"),
  artifact("com.facebook.react", "react-android", "0.88.1", "-release.aar"),
  artifact("com.google.android.material", "material", "1.13.0", ".aar"),
];
const asm = artifact("org.ow2.asm", "asm", "9.8", ".jar");
const temporary = mkdtempSync(join(tmpdir(), "clover-android-bytecode-"));
const source = `
import java.io.*;
import java.util.*;
import java.util.zip.*;
import org.objectweb.asm.*;
import ph.clover.build.CloverCompatibilityVisitor;
public class BytecodeCheck {
  static final Set<String> expected = new HashSet<>(Arrays.asList(
    "com/clerk/api/image/ImageService", "com/facebook/react/views/view/WindowUtilKt",
    "com/google/android/material/internal/EdgeToEdgeUtils",
    "com/google/android/material/bottomsheet/BottomSheetDialog",
    "com/google/android/material/sidesheet/SheetDialog"));
  static int targets;
  public static void main(String[] args) throws Exception {
    for (String file: args) try (ZipFile aar = new ZipFile(file)) {
      try (ZipInputStream classes = new ZipInputStream(aar.getInputStream(aar.getEntry("classes.jar")))) {
        ZipEntry entry;
        while ((entry = classes.getNextEntry()) != null) {
          if (!entry.getName().endsWith(".class")) continue;
          // ClassReader provides the exact JVM class name even for synthetic classes.
          ClassReader original = new ClassReader(classes.readAllBytes());
          String name = original.getClassName();
          if (name.equals("com/facebook/react/modules/statusbar/StatusBarModule")) {
            if (CloverCompatibilityVisitor.isTarget(name)) throw new AssertionError("Obsolete RN status-bar shim retained");
          }
          if (!CloverCompatibilityVisitor.isTarget(name)) continue;
          ClassWriter output = new ClassWriter(0);
          original.accept(new CloverCompatibilityVisitor(output), 0);
          final int[] helpers = {0};
          new ClassReader(output.toByteArray()).accept(new ClassVisitor(Opcodes.ASM9) {
            public MethodVisitor visitMethod(int a, String n, String d, String s, String[] e) {
              return new MethodVisitor(Opcodes.ASM9) {
                public void visitMethodInsn(int op, String owner, String method, String desc, boolean itf) {
                  if (owner.equals("ph/clover/compat/AndroidCompatibility")) helpers[0]++;
                  if (owner.equals("android/view/Window") && (method.equals("getStatusBarColor") || method.equals("setStatusBarColor") || method.equals("setNavigationBarColor"))) throw new AssertionError("Unrewritten window call");
                  if (owner.equals("android/graphics/BitmapFactory") && method.equals("decodeFile") && desc.equals("(Ljava/lang/String;)Landroid/graphics/Bitmap;")) throw new AssertionError("Unbounded image decode");
                }
                public void visitFieldInsn(int op, String owner, String field, String desc) {
                  if (op == Opcodes.PUTFIELD && owner.equals("android/view/WindowManager$LayoutParams") && field.equals("layoutInDisplayCutoutMode")) throw new AssertionError("Unrewritten cutout call");
                }
              };
            }
          }, 0);
          if (helpers[0] == 0 || !expected.remove(name)) throw new AssertionError("Unexpected target: " + name);
          targets++;
        }
      }
    }
    if (!expected.isEmpty()) throw new AssertionError("Missing targets: " + expected);
    System.out.println("PASS real release dependency bytecode: " + targets + " compatibility targets; no unbounded decoder or deprecated window call remains in those targets");
  }
}`;
try {
  writeFileSync(join(temporary, "BytecodeCheck.java"), source);
  const java = name => process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin", name) : name;
  execFileSync(java("javac"), ["-cp", asm, "-d", temporary, join(temporary, "BytecodeCheck.java"), fileURLToPath(new URL("../plugins/android-release/CloverCompatibilityVisitor.java", import.meta.url))], { stdio: "pipe" });
  execFileSync(java("java"), ["-cp", `${temporary}:${asm}`, "BytecodeCheck", ...artifacts], { stdio: "inherit" });
} finally { rmSync(temporary, { recursive: true, force: true }); }
