Pod::Spec.new do |s|
  s.name = 'TaxigrMaxTls'
  s.version = '1.0.0'
  s.summary = 'Domain-scoped HTTPS transport for the MAX API'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'Taxi Grahovo'
  s.homepage = 'https://taxigr.ru'
  s.source = { :git => 'https://taxigr.ru' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Security'
  s.source_files = '**/*.swift'
  s.resource_bundles = { 'TaxigrMaxTls' => ['Resources/*.cer'] }
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
