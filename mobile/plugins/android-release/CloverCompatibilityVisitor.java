package ph.clover.build;

import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;

/** Narrow call-site substitutions, before R8; no vendor JAR or cache is mutated. */
public final class CloverCompatibilityVisitor extends ClassVisitor {
  private static final String HELPER = "ph/clover/compat/AndroidCompatibility";
  private static final String IMAGE = "com/clerk/api/image/ImageService";
  private String className;
  private int replacements;

  public CloverCompatibilityVisitor(ClassVisitor next) { super(Opcodes.ASM9, next); }

  public static boolean isTarget(String name) {
    return name.equals(IMAGE)
        || name.equals("com/facebook/react/modules/statusbar/StatusBarModule")
        || name.equals("com/facebook/react/modules/statusbar/StatusBarModule$setColor$1")
        || name.equals("com/facebook/react/views/view/WindowUtilKt")
        || name.equals("com/google/android/material/internal/EdgeToEdgeUtils")
        || name.equals("com/google/android/material/bottomsheet/BottomSheetDialog")
        || name.equals("com/google/android/material/sidesheet/SheetDialog");
  }

  @Override public void visit(int version, int access, String name, String signature,
      String superName, String[] interfaces) {
    className = name;
    super.visit(version, access, name, signature, superName, interfaces);
  }

  @Override public MethodVisitor visitMethod(int access, String name, String descriptor,
      String signature, String[] exceptions) {
    MethodVisitor next = super.visitMethod(access, name, descriptor, signature, exceptions);
    if (!isTarget(className)) return next;
    return new MethodVisitor(Opcodes.ASM9, next) {
      @Override public void visitMethodInsn(int opcode, String owner, String method,
          String desc, boolean isInterface) {
        if (className.equals(IMAGE) && name.equals("compressImage")
            && opcode == Opcodes.INVOKESTATIC && owner.equals("android/graphics/BitmapFactory")
            && method.equals("decodeFile") && desc.equals("(Ljava/lang/String;)Landroid/graphics/Bitmap;")) {
          replacements++;
          super.visitMethodInsn(Opcodes.INVOKESTATIC, HELPER, "decodeProfilePhoto", desc, false);
          return;
        }
        if (!className.equals(IMAGE) && opcode == Opcodes.INVOKEVIRTUAL && owner.equals("android/view/Window")) {
          boolean getter = method.equals("getStatusBarColor") && desc.equals("()I");
          boolean setter = (method.equals("setStatusBarColor") || method.equals("setNavigationBarColor")) && desc.equals("(I)V");
          if (getter || setter) {
            replacements++;
            super.visitMethodInsn(Opcodes.INVOKESTATIC, HELPER, method,
                getter ? "(Landroid/view/Window;)I" : "(Landroid/view/Window;I)V", false);
            return;
          }
        }
        super.visitMethodInsn(opcode, owner, method, desc, isInterface);
      }
      @Override public void visitFieldInsn(int opcode, String owner, String field, String desc) {
        if (!className.equals(IMAGE) && opcode == Opcodes.PUTFIELD
            && owner.equals("android/view/WindowManager$LayoutParams")
            && field.equals("layoutInDisplayCutoutMode") && desc.equals("I")) {
          replacements++;
          super.visitMethodInsn(Opcodes.INVOKESTATIC, HELPER, "setCutoutMode",
              "(Landroid/view/WindowManager$LayoutParams;I)V", false);
          return;
        }
        super.visitFieldInsn(opcode, owner, field, desc);
      }
    };
  }

  @Override public void visitEnd() {
    if (isTarget(className) && replacements == 0) {
      throw new IllegalStateException("Review Android compatibility shim: " + className + " changed upstream.");
    }
    super.visitEnd();
  }
}
