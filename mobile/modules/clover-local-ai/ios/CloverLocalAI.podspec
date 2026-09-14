Pod::Spec.new do |s|
  s.name = 'CloverLocalAI'
  s.version = '1.0.0'
  s.summary = 'Clover on-device language and document tools'
  s.description = 'Native offline inference and OCR for Clover.'
  s.author = 'Clover Innovations OPC'
  s.homepage = 'https://clover.ph'
  s.license = { :type => 'Proprietary' }
  s.platforms = { :ios => '16.4' }
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.frameworks = 'Vision', 'PDFKit'
  s.weak_frameworks = 'FoundationModels'
  s.swift_version = '5.0'
end
