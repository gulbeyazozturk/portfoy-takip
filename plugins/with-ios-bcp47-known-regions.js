const { withXcodeProject } = require('expo/config-plugins');

/**
 * App Store (ITMS-90176): "Base" / "base" .lproj BCP47 değildir.
 * react-native-localization-settings knownRegions'e Base ekler; burada sadece en + tr kalır.
 */
function withIosBcp47KnownRegions(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectObject = project.pbxProjectSection()[project.getFirstProject().uuid];
    if (projectObject) {
      projectObject.knownRegions = ['en', 'tr'];
      projectObject.developmentRegion = 'en';
    }
    return config;
  });
}

module.exports = withIosBcp47KnownRegions;
