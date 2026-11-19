import importlib.util, json, plistlib, tempfile, zipfile
from pathlib import Path
spec = importlib.util.spec_from_file_location('inspection', Path(__file__).with_name('inspect-package.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
commit, api = 'a' * 40, 'https://clover.ph'
release = dict(sourceCommit=commit, sourceFingerprint='b' * 64, apiUrl=api, version='1.2.3', build=9)
config = dict(version='1.2.3', extra=dict(release=release), android=dict(package='ph.clover.app', versionCode=9), ios=dict(buildNumber='9'))
with tempfile.TemporaryDirectory(prefix='clover-package-inspection-') as directory:
    root = Path(directory)
    def archive(name, config, ios=False, build='9'):
        target = root / name
        with zipfile.ZipFile(target, 'w') as package:
            package.writestr('Payload/Clover.app/EXConstants.bundle/app.config' if ios else 'base/assets/app.config', json.dumps(config))
            if ios:
                package.writestr('Payload/Clover.app/Info.plist', plistlib.dumps(dict(CFBundleIdentifier='ph.clover.app', CFBundleShortVersionString='1.2.3', CFBundleVersion=build)))
        return target
    android = archive('fixture.aab', config)
    assert module.inspect_package(android, commit, api)['provenanceVerified']
    assert not module.inspect_package(android, 'c' * 40, api)['provenanceVerified']
    assert not module.inspect_package(android, commit, 'https://staging.clover.ph')['provenanceVerified']
    ios = archive('fixture.ipa', config, True)
    assert module.inspect_package(ios, commit, api)['provenanceVerified']
    mismatch = archive('mismatched.ipa', config, True, '10')
    assert not module.inspect_package(mismatch, commit, api)['provenanceVerified']
    old = archive('old.aab', dict(config, extra={}))
    assert not module.inspect_package(old, commit, api)['provenanceVerified']
print('PASS actual ZIP-config inspection: matching IPA/AAB, wrong source/environment, native iOS version mismatch and missing old-release provenance')
