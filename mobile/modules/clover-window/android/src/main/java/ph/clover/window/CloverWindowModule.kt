package ph.clover.window

import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.catch

class CloverWindowModule : Module() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private var observation: Job? = null
  private var observing = false

  private fun observe() {
    observation?.cancel()
    if (!observing) return
    val activity = appContext.currentActivity ?: return
    observation = scope.launch {
      WindowInfoTracker.getOrCreate(activity).windowLayoutInfo(activity)
        .catch { sendEvent("layoutChanged", mapOf("folds" to emptyList<Map<String, Any>>())) }
        .collect { info ->
        val density = activity.resources.displayMetrics.density
        val folds = info.displayFeatures.filterIsInstance<FoldingFeature>().map { fold ->
          mapOf(
            "x" to fold.bounds.left / density,
            "y" to fold.bounds.top / density,
            "width" to fold.bounds.width() / density,
            "height" to fold.bounds.height() / density,
            "vertical" to (fold.orientation == FoldingFeature.Orientation.VERTICAL),
            "separating" to (fold.isSeparating || fold.occlusionType == FoldingFeature.OcclusionType.FULL)
          )
        }
        sendEvent("layoutChanged", mapOf("folds" to folds))
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("CloverWindow")
    Events("layoutChanged")
    OnStartObserving { observing = true; observe() }
    OnStopObserving { observing = false; observation?.cancel() }
    OnActivityEntersForeground { observe() }
    OnActivityEntersBackground { observation?.cancel() }
    OnActivityDestroys { observation?.cancel() }
    OnDestroy { scope.cancel() }
  }
}
