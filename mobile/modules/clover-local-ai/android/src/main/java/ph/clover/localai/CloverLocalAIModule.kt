package ph.clover.localai

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.ModuleDefinition
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.prompt.generateContentRequest
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.google.mlkit.vision.common.InputImage
import android.net.Uri
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.tasks.await

class CloverLocalAIModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CloverLocalAI")
    AsyncFunction("capabilities") Coroutine { ->
      val status = Generation.getClient().checkStatus()
      mapOf("model" to when(status) {
        FeatureStatus.AVAILABLE -> "available"
        FeatureStatus.DOWNLOADABLE -> "downloadable"
        FeatureStatus.DOWNLOADING -> "downloading"
        else -> "unavailable"
      }, "provider" to "Gemini Nano", "detail" to "On-device availability depends on this device and its downloaded model. Local calculations and OCR remain available.")
    }
    AsyncFunction("download") Coroutine { ->
      val model=Generation.getClient()
      model.download().collect { }
      check(model.checkStatus()==FeatureStatus.AVAILABLE) { "Model download did not complete. Try again while connected." }
    }
    AsyncFunction("generate") Coroutine { prompt: String ->
      require(prompt.length<=10000) { "Shorten this on-device request." }
      val model=Generation.getClient()
      check(model.checkStatus()==FeatureStatus.AVAILABLE) { "The on-device model is unavailable." }
      model.generateContent(generateContentRequest(TextPart(prompt)) { temperature=0.2f; maxOutputTokens=512 }).candidates.firstOrNull()?.text ?: error("No on-device response was generated.")
    }
    AsyncFunction("extractText") Coroutine { uri: String -> withContext(Dispatchers.IO) {
      val parsed=Uri.parse(uri)
      require(parsed.scheme=="file") { "Choose a local file." }
      val file=File(parsed.path ?: error("Invalid file."))
      require(file.length() in 1..3500000) { "Choose a file up to 3.5 MB." }
      val recognizer=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      try {
        var count=1;var total=1
        val text=if(file.extension.lowercase()=="pdf") {
          ParcelFileDescriptor.open(file,ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
            PdfRenderer(fd).use { renderer ->
              total=renderer.pageCount;count=minOf(total,5)
              (0 until count).map { index -> renderer.openPage(index).use { page ->
                val scale=minOf(1400f/page.width,1800f/page.height)
                val bitmap=Bitmap.createBitmap(maxOf(1,(page.width*scale).toInt()),maxOf(1,(page.height*scale).toInt()),Bitmap.Config.ARGB_8888)
                try {bitmap.eraseColor(android.graphics.Color.WHITE);page.render(bitmap,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);recognizer.process(InputImage.fromBitmap(bitmap,0)).await().text} finally {bitmap.recycle()}
              }}.joinToString("\n\n")
            }
          }
        } else {
          val bounds=BitmapFactory.Options().apply { inJustDecodeBounds=true };BitmapFactory.decodeFile(file.path,bounds)
          require(bounds.outWidth>0&&bounds.outHeight>0&&bounds.outWidth.toLong()*bounds.outHeight<=24000000) { "This image needs online processing or a smaller copy for local OCR." }
          recognizer.process(InputImage.fromFilePath(appContext.reactContext ?: error("Clover is not ready."),parsed)).await().text
        }
        mapOf("text" to text.take(40000),"pagesRead" to count,"totalPages" to total,"complete" to (count==total&&text.length<=40000))
      } finally {recognizer.close()}
    }}
  }
}
