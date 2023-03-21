const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MODULES_FOLDER = path.join(__dirname, 'modules');

const checkDependencies = async () => {
  console.log('Checking for missing dependencies in all modules...');

  const modules = fs.readdirSync(MODULES_FOLDER).filter(file => file.endsWith('.js'));

  for (const moduleFile of modules) {
    const modulePath = path.join(MODULES_FOLDER, moduleFile);
    const moduleContent = fs.readFileSync(modulePath, 'utf8');

    const dependencies = getDependencies(moduleContent);
    if (dependencies.length > 0) {
      console.log(`Module '${moduleFile}' requires the following dependencies: ${dependencies.join(', ')}`);

      const missingDependencies = dependencies.filter(dependency => !checkDependency(dependency));
      if (missingDependencies.length > 0) {
        console.log(`Missing dependencies for module '${moduleFile}': ${missingDependencies.join(', ')}`);
        console.log(`Installing missing dependencies for module '${moduleFile}'...`);
        installDependencies(missingDependencies);
      }
    }
  }

  console.log('Dependency check complete!');
};

const getDependencies = (moduleContent) => {
  const dependenciesRegex = /require\(['"](.+)['"]\)/g;
  const dependencies = [];
  let match;

  while ((match = dependenciesRegex.exec(moduleContent))) {
    dependencies.push(match[1]);
  }

  return dependencies;
};

const checkDependency = (dependency) => {
  try {
    require.resolve(dependency);
    return true;
  } catch (error) {
    return false;
  }
};

const installDependencies = (dependencies) => {
  const command = `npm install ${dependencies.join(' ')}`;
  execSync(command, { stdio: 'inherit' });
};

module.exports = {
  name: 'dependency-checker',
  description: 'Checks and installs missing dependencies for all modules.',
  execute(message, args) {
    checkDependencies();
  },
};
