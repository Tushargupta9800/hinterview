import Foundation
import Speech

struct Response: Codable {
  let text: String?
  let error: String?
}

func writeResponse(_ response: Response, to outputPath: String) {
  let encoder = JSONEncoder()
  if let data = try? encoder.encode(response) {
    try? data.write(to: URL(fileURLWithPath: outputPath))
  }
}

let args = CommandLine.arguments

guard args.count >= 3 else {
  fputs("missing input/output arguments\n", stderr)
  exit(2)
}

let inputPath = args[1]
let outputPath = args[2]
let localeIdentifier = args.count >= 4 ? args[3] : "en-US"

let authorizationSemaphore = DispatchSemaphore(value: 0)
var authorizationStatus: SFSpeechRecognizerAuthorizationStatus = .notDetermined

SFSpeechRecognizer.requestAuthorization { status in
  authorizationStatus = status
  authorizationSemaphore.signal()
}

_ = authorizationSemaphore.wait(timeout: .now() + 15)

guard authorizationStatus == .authorized else {
  let message: String
  switch authorizationStatus {
  case .denied:
    message = "Speech recognition permission was denied on this Mac."
  case .restricted:
    message = "Speech recognition is restricted on this Mac."
  case .notDetermined:
    message = "Speech recognition permission was not granted yet."
  @unknown default:
    message = "Speech recognition is unavailable right now."
  }
  writeResponse(Response(text: nil, error: message), to: outputPath)
  exit(1)
}

guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeIdentifier)) else {
  writeResponse(Response(text: nil, error: "Unable to initialize the local speech recognizer."), to: outputPath)
  exit(1)
}

guard recognizer.isAvailable else {
  writeResponse(Response(text: nil, error: "The local speech recognizer is not available right now."), to: outputPath)
  exit(1)
}

let request = SFSpeechURLRecognitionRequest(url: URL(fileURLWithPath: inputPath))
request.shouldReportPartialResults = false
request.requiresOnDeviceRecognition = false

let completionSemaphore = DispatchSemaphore(value: 0)
var finalText = ""
var finalError: String?

var recognitionTask: SFSpeechRecognitionTask?
recognitionTask = recognizer.recognitionTask(with: request) { result, error in
  if let result {
    if result.isFinal {
      finalText = result.bestTranscription.formattedString
      completionSemaphore.signal()
    }
  }

  if let error {
    finalError = error.localizedDescription
    completionSemaphore.signal()
  }
}

_ = completionSemaphore.wait(timeout: .now() + 120)
recognitionTask?.cancel()

if let finalError {
  writeResponse(Response(text: nil, error: finalError), to: outputPath)
  exit(1)
}

let cleaned = finalText.trimmingCharacters(in: .whitespacesAndNewlines)
if cleaned.isEmpty {
  writeResponse(Response(text: nil, error: "No speech was detected. Try again and speak more clearly into the microphone."), to: outputPath)
  exit(1)
}

writeResponse(Response(text: cleaned, error: nil), to: outputPath)
