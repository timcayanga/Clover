Pod::Spec.new do |s|
  s.name = 'CloverLauncher'
  s.version = '1.0.0'
  s.summary = 'Clover home screen quick actions'
  s.author = 'Clover Innovations OPC'
  s.homepage = 'https://clover.ph'
  s.license = { :type => 'Proprietary' }
  s.platforms = { :ios => '17.0' }
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
  s.swift_version = '5.0'
end
