package ph.clover.build;

import com.android.build.api.instrumentation.AsmClassVisitorFactory;
import com.android.build.api.instrumentation.ClassContext;
import com.android.build.api.instrumentation.ClassData;
import com.android.build.api.instrumentation.InstrumentationParameters;
import org.objectweb.asm.ClassVisitor;

public abstract class CloverCompatibilityFactory
    implements AsmClassVisitorFactory<InstrumentationParameters.None> {
  @Override public boolean isInstrumentable(ClassData data) {
    return CloverCompatibilityVisitor.isTarget(data.getClassName().replace('.', '/'));
  }
  @Override public ClassVisitor createClassVisitor(ClassContext context, ClassVisitor next) {
    return new CloverCompatibilityVisitor(next);
  }
}
