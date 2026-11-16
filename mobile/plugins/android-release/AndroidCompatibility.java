package ph.clover.compat;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.os.Build;
import android.view.Window;
import android.view.WindowManager;

/** Runtime guards for SDK call sites. Legacy behavior is retained only below API 35. */
public final class AndroidCompatibility {
  private AndroidCompatibility() {}

  public static Bitmap decodeProfilePhoto(String path) {
    BitmapFactory.Options bounds = new BitmapFactory.Options();
    bounds.inJustDecodeBounds = true;
    BitmapFactory.decodeFile(path, bounds);
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      throw new IllegalArgumentException("Unable to read the selected profile photo.");
    }
    BitmapFactory.Options options = new BitmapFactory.Options();
    // This decoder is used only by Clerk profile photos, never receipts/OCR.
    // Round upwards to keep even panoramic/high-resolution photos within 1024px.
    options.inSampleSize = profilePhotoSampleSize(bounds.outWidth, bounds.outHeight);
    options.inPreferredConfig = Bitmap.Config.ARGB_8888;
    Bitmap bitmap = BitmapFactory.decodeFile(path, options);
    if (bitmap == null) throw new IllegalArgumentException("Unable to decode the selected profile photo.");
    return bitmap;
  }

  public static int profilePhotoSampleSize(int width, int height) {
    int sample = 1;
    int longest = Math.max(width, height);
    while ((longest + (long) sample - 1) / sample > 1024) sample *= 2;
    return sample;
  }

  @SuppressWarnings("deprecation")
  public static int getStatusBarColor(Window window) {
    return Build.VERSION.SDK_INT >= 35 ? Color.TRANSPARENT : window.getStatusBarColor();
  }

  @SuppressWarnings("deprecation")
  public static void setStatusBarColor(Window window, int color) {
    if (Build.VERSION.SDK_INT < 35) window.setStatusBarColor(color);
  }

  @SuppressWarnings("deprecation")
  public static void setNavigationBarColor(Window window, int color) {
    if (Build.VERSION.SDK_INT < 35) window.setNavigationBarColor(color);
  }

  public static void setCutoutMode(WindowManager.LayoutParams attributes, int mode) {
    if (Build.VERSION.SDK_INT >= 35
        && (mode == WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT
            || mode == WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES)) {
      mode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
    }
    attributes.layoutInDisplayCutoutMode = mode;
  }
}
