const pathLib = require('path');

const types = require('@babel/types');

const {
  collectEsmExports,
  getIndexFileFromDirectory,
} = require('./src/collect-esm-exports');
const { err, partition } = require('./src/misc');

const cachedResolvers = {};

function getCachedExports({ barrelDirPath }) {

  if (cachedResolvers[barrelDirPath]) {
    return cachedResolvers[barrelDirPath];
  } else {
    cachedResolvers[barrelDirPath] = collectEsmExports(barrelDirPath);
  }

  return cachedResolvers[barrelDirPath];
}

module.exports = function () {
  return {
    visitor: {
      ImportDeclaration(path, state) {
        const moduleName = path.node.source.value;
        const targetDir = pathLib.join(state.filename, '..', moduleName); // User/kv/h3-fe-consumer/src/barrelFolder

        const isTargetDirHasBarrelFolder = state.opts.barrelFiles.some(
          barrelPath => pathLib.join(state.cwd, barrelPath) === targetDir, // barrelPath === 'src/barrelFolder'
        );

        if (!isTargetDirHasBarrelFolder) {
          return;
        }

        const transforms = [];

        const exports = getCachedExports({
          barrelDirPath: targetDir
        });

        const [fullImports, memberImports] = partition(
          specifier => specifier.type !== 'ImportSpecifier',
          path.node.specifiers,
        );

        if (fullImports.length) {
          err('Full imports are not supported');
        }

        for (const memberImport of memberImports) {
          const importName = memberImport.imported.name;
          const localName = memberImport.local.name;
          const exportInfo = exports[importName];

          if (!exports[importName]) {
            // console.log(
            //   `[${moduleName}] No export info found for ${importName}`,
            // );
            continue;
          }

          const importFrom = pathLib.join(targetDir, exportInfo.importPath);

          // console.log(
          //   `[${moduleName}] Resolving '${importName}' to ${importFrom}`,
          // );

          let newImportSpecifier = memberImport;

          if (exportInfo.importAlias) {
            newImportSpecifier = types.importSpecifier(
              types.identifier(localName),
              types.identifier(exportInfo.importAlias),
            );
          }

          transforms.push(
            types.importDeclaration(
              [newImportSpecifier],
              types.stringLiteral(importFrom),
            ),
          );
        }

        if (transforms.length > 0) {
          path.replaceWithMultiple(transforms);
        }
      },
    },
  };
};
