import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { configureGradle } = require("../plugins/with-clover-android-release.cjs");
const source = 'proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"';
assert.match(configureGradle(source), /proguard-android-optimize\.txt/);
assert.equal(configureGradle(configureGradle(source)), configureGradle(source));
assert.throws(() => configureGradle("new template"), /Review/);
const config = readFileSync(new URL("../app.config.ts", import.meta.url), "utf8");
assert.match(config, /enableMinifyInReleaseBuilds: true/);
assert.match(config, /enableShrinkResourcesInReleaseBuilds: true/);

// Exercise the real runtime helper against observable platform doubles. This
// catches API-35 calls, lost legacy behavior, and allocating before reading bounds.
const files = {
  "android/os/Build.java": `package android.os; public class Build { public static class VERSION { public static int SDK_INT; } }`,
  "android/graphics/Color.java": `package android.graphics; public class Color { public static final int TRANSPARENT=0; }`,
  "android/graphics/Bitmap.java": `package android.graphics; public class Bitmap { public enum Config { ARGB_8888 } }`,
  "android/graphics/BitmapFactory.java": `package android.graphics;
    public class BitmapFactory {
      public static int boundsCalls, pixelCalls, sample, width=8000, height=6000;
      public static boolean fail;
      public static class Options { public boolean inJustDecodeBounds; public int outWidth,outHeight,inSampleSize; public Bitmap.Config inPreferredConfig; }
      public static Bitmap decodeFile(String path, Options options) {
        if (options.inJustDecodeBounds) { boundsCalls++; options.outWidth=width; options.outHeight=height; return null; }
        if (boundsCalls != pixelCalls+1) throw new AssertionError("pixels decoded before bounds");
        pixelCalls++; sample=options.inSampleSize;
        return fail ? null : new Bitmap();
      }
    }`,
  "android/view/Window.java": `package android.view; public class Window {
    public int reads, statusWrites, navigationWrites, status=123, navigation=456;
    public int getStatusBarColor() { reads++; return status; }
    public void setStatusBarColor(int color) { statusWrites++; status=color; }
    public void setNavigationBarColor(int color) { navigationWrites++; navigation=color; }
  }`,
  "android/view/WindowManager.java": `package android.view; public class WindowManager {
    public static class LayoutParams {
      public static final int LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT=0, LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES=1, LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS=3;
      public int layoutInDisplayCutoutMode;
    }
  }`,
  "ReleaseCheck.java": `import ph.clover.compat.AndroidCompatibility;
    import android.os.Build; import android.view.*; import android.graphics.*;
    public class ReleaseCheck {
      static void check(boolean value) { if (!value) throw new AssertionError(); }
      public static void main(String[] args) {
        for (int sdk : new int[] {26,28,30,34,35,36}) {
          Build.VERSION.SDK_INT=sdk; Window w=new Window();
          check(AndroidCompatibility.getStatusBarColor(w)==(sdk>=35?0:123));
          AndroidCompatibility.setStatusBarColor(w,17); AndroidCompatibility.setNavigationBarColor(w,18);
          check(w.reads==(sdk>=35?0:1)); check(w.statusWrites==(sdk>=35?0:1)); check(w.navigationWrites==(sdk>=35?0:1));
          check(w.status==(sdk>=35?123:17)); check(w.navigation==(sdk>=35?456:18));
          for (int mode=0;mode<=3;mode++) {
            WindowManager.LayoutParams p=new WindowManager.LayoutParams();
            AndroidCompatibility.setCutoutMode(p,mode);
            check(p.layoutInDisplayCutoutMode==(sdk>=35 && mode<2 ? 3 : mode));
          }
        }
        int[][] photos={{112,112},{1024,1024},{1025,512},{8000,6000},{6000,8000},{24000,500},{Integer.MAX_VALUE,1}};
        for (int[] photo:photos) {
          BitmapFactory.width=photo[0]; BitmapFactory.height=photo[1];
          check(AndroidCompatibility.decodeProfilePhoto("photo.jpg")!=null);
          int sample=BitmapFactory.sample;
          check(sample>=1 && (sample & (sample-1))==0);
          check((Math.max(photo[0],photo[1])+(long)sample-1)/sample<=1024);
          if (sample>1) check((Math.max(photo[0],photo[1])+(long)(sample/2)-1)/(sample/2)>1024);
        }
        BitmapFactory.fail=true;
        try { AndroidCompatibility.decodeProfilePhoto("corrupt.jpg"); throw new AssertionError(); }
        catch (IllegalArgumentException expected) {}
        BitmapFactory.width=-1; int before=BitmapFactory.pixelCalls;
        try { AndroidCompatibility.decodeProfilePhoto("not-image.pdf"); throw new AssertionError(); }
        catch (IllegalArgumentException expected) {}
        check(BitmapFactory.pixelCalls==before);
        System.out.println("Android release checks passed: API 26–36 compatibility, bounded decoding, corrupt image handling, repeatable prebuild.");
      }
    }`,
};
const temporary = mkdtempSync(join(tmpdir(), "clover-android-release-check-"));
try {
  for (const [file, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(temporary, file)), { recursive: true });
    writeFileSync(join(temporary, file), contents);
  }
  const javaHome = process.env.JAVA_HOME;
  const java = name => javaHome ? join(javaHome, "bin", name) : name;
  execFileSync(java("javac"), ["-d", temporary, ...Object.keys(files).map(f=>join(temporary,f)),
    fileURLToPath(new URL("../plugins/android-release/AndroidCompatibility.java", import.meta.url))], { stdio: "pipe" });
  execFileSync(java("java"), ["-cp", temporary, "ReleaseCheck"], { stdio: "inherit" });
} finally { rmSync(temporary, { recursive: true, force: true }); }
