import Foundation
import ImageIO
import Vision

// Match Clover's native image OCR settings. This runs with the macOS Vision
// runtime and is a comparison probe, rather than an iOS device result.
let bytes = FileHandle.standardInput.readDataToEndOfFile()
let options: [CFString: Any] = [
    kCGImageSourceCreateThumbnailFromImageAlways: true,
    kCGImageSourceCreateThumbnailWithTransform: true,
    kCGImageSourceThumbnailMaxPixelSize: 2000
]
guard let source = CGImageSourceCreateWithData(bytes as CFData, nil),
      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
    exit(2)
}
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
request.automaticallyDetectsLanguage = true
try VNImageRequestHandler(cgImage: image).perform([request])
let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
print(String(text.prefix(40000)))
