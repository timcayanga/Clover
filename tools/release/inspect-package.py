"""Inspect source provenance from actual IPA/AAB bytes; never uploads a package."""
import argparse, hashlib, json, plistlib, zipfile
from pathlib import Path


def inspect_package(artifact, expected_commit, expected_api):
    artifact = Path(artifact)
    digest = hashlib.sha256()
    with artifact.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    result = {'artifactPath': str(artifact), 'artifactSha256': digest.hexdigest(), 'provenanceVerified': False}
    with zipfile.ZipFile(artifact) as package:
        names = package.namelist()
        if 'base/assets/app.config' in names:
            config = json.loads(package.read('base/assets/app.config'))
            result.update(platform='android', version=config.get('version'), build=config.get('android', {}).get('versionCode'), appId=config.get('android', {}).get('package'), nativeManifestVersionVerified=False)
        else:
            configs = [name for name in names if name.startswith('Payload/') and name.endswith('.app/EXConstants.bundle/app.config')]
            if len(configs) != 1:
                raise ValueError('Expected exactly one main iOS app config')
            config_path = configs[0]
            config = json.loads(package.read(config_path))
            info = plistlib.loads(package.read(config_path.split('/EXConstants.bundle/')[0] + '/Info.plist'))
            result.update(platform='ios', version=info.get('CFBundleShortVersionString'), build=int(info.get('CFBundleVersion', 0)), appId=info.get('CFBundleIdentifier'), nativeManifestVersionVerified=True)
            if config.get('version') != result['version'] or str(config.get('ios', {}).get('buildNumber')) != str(result['build']):
                result['error'] = 'Embedded config and native iOS version differ'
                return result
    release = config.get('extra', {}).get('release') or {}
    result.update(sourceCommit=release.get('sourceCommit'), sourceFingerprint=release.get('sourceFingerprint'), apiUrl=release.get('apiUrl'))
    valid = (result['appId'] == 'ph.clover.app' and result['sourceCommit'] == expected_commit and result['apiUrl'] == expected_api
             and isinstance(result['sourceFingerprint'], str) and len(result['sourceFingerprint']) == 64 and all(c in '0123456789abcdef' for c in result['sourceFingerprint'])
             and release.get('version') == result['version'] and release.get('build') == result['build'])
    result['provenanceVerified'] = valid
    if not valid:
        result['error'] = 'Missing or mismatched embedded source, API environment, version/build or app ID'
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('artifact')
    parser.add_argument('--commit', required=True)
    parser.add_argument('--api', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    result = inspect_package(args.artifact, args.commit, args.api)
    Path(args.output).write_text(json.dumps(result, indent=2) + '\n')
    print('PASS embedded package provenance' if result['provenanceVerified'] else 'BLOCKED: ' + result['error'])
    # Android source config inspection does not substitute for bundletool/native
    # version inspection or an installed-package runtime test.
    raise SystemExit(0 if result['provenanceVerified'] else 1)
