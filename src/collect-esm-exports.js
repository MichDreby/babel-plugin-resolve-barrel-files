/* eslint-disable complexity */
const fs = require('fs');
const pathLib = require('path');

const { functionDeclaration } = require('@babel/types');
const ts = require('typescript');

/**
 * Parses a ESM barrel (index) file, extracts all it's export
 * names and returns an object that maps
 * a import name to the path + some meta infos.
 *
 * Note: this doesn't handle the following cases:
 * ```
 * import {A, B} from './foo';
 *
 * export {A,B}
 *
 * export * as Namespace from './foo';
 * ```
 *
 * The case above is not supported.
 */

const cachedExports = {};

// /Users/mikhail_dziarbeyeu/Desktop/h3-fe-consumer/src/barrelFolder
// export { Some, Some2 } from './exacFile';
// export * from './Another';

const getIndexFileFromDirectory = path =>
  fs.readdirSync(path).find(item => item?.includes('index'));

const getNonIndexFileFromDirectory = (dirPath, filePath) =>
  fs.readdirSync(dirPath).find(item => {
    const filePattern = new RegExp(`${pathLib.parse(filePath)?.base}\\.\\w+$`);

    return item.match(filePattern);
  });

const getImportFileFromPathSync = path => {
  try {
    const lstat = fs.lstatSync(path);
    if (lstat.isDirectory()) {
      const fileName = getIndexFileFromDirectory(path);

      return pathLib.join(path, fileName);
    } else {
      return path;
    }
  } catch (error) {
    // no such file or directory
    const fileName = getNonIndexFileFromDirectory(
      pathLib.join(path, '..'),
      path,
    );

    return pathLib.join(pathLib.parse(path)?.dir, fileName);
  }
};

const isWildCardExport = node =>
  ts.isExportDeclaration(node) &&
  Boolean(node.moduleSpecifier) &&
  !node?.exportClause;

const hasExportKeyword = node => {
  return node?.modifiers?.some(modifier => ts.isExportModifier(modifier));
};

const isExportStatement = node =>
  ts.isExportDeclaration(node) || hasExportKeyword(node);

const isNamedExportWithoutModuleSpecifier = node => {
  return (
    ts.isExportDeclaration(node) &&
    !node.moduleSpecifier &&
    ts.isNamedExports(node.exportClause)
  );
};

const collectEsmExports = (importFromPath = '', prevImportPath = '') => {
  // importFromPath = /Users/mikhail_dziarbeyeu/Desktop/h3-fe-consumer/src/barrelFolder

  // console.log('**********\n', 'importFromPath', importFromPath);

  // console.log('**********\n', 'prevImportPath', prevImportPath);

  const importFromFilePath = getImportFileFromPathSync(importFromPath);

  // console.log('**********\n', 'importFromFilePath', importFromFilePath);

  const importSourceFile = ts.createSourceFile(
    importFromFilePath,
    fs.readFileSync(importFromFilePath).toString(),
    ts.ScriptTarget.ES2015,
    true,
  );

  importSourceFile.forEachChild(declarationNode => {
    // console.log(
    //   '**********\n',
    //   `declarationNode ${importFromFilePath}`,
    //   declarationNode.kind,
    //   // declarationNode,
    // );

    if (isExportStatement(declarationNode)) {
      if (ts.isExportDeclaration(declarationNode)) {
        if (isWildCardExport(declarationNode)) {
          const nodeImportFromPath = declarationNode.moduleSpecifier.text;

          const nextImportFromPath = pathLib.join(
            importFromPath,
            nodeImportFromPath,
          );
          const nextPrefixPath = pathLib.join(
            prevImportPath,
            nodeImportFromPath,
          );
          // console.log('**********\n', 'isWildCardExport', {
          //   nodeImportFromPath,
          //   nextImportFromPath,
          //   nextPrefixPath,
          // });

          collectEsmExports(nextImportFromPath, nextPrefixPath);
        } else if (isNamedExportWithoutModuleSpecifier(declarationNode)) {
          declarationNode.exportClause.forEachChild(importMember => {
            if (ts.isExportSpecifier(importMember)) {
              cachedExports[importMember.name.text] = {
                importPath: prevImportPath,
                importAlias: undefined,
              };
            }
          });
        } else {
          const nodeImportFromPath = declarationNode.moduleSpecifier.text;

          // console.log('**********\n', 'NOT isWildCardExport', {
          //   nodeImportFromPath,
          // });

          declarationNode.exportClause.forEachChild(importMember => {
            if (ts.isExportSpecifier(importMember)) {
              cachedExports[importMember.name.text] = {
                importPath: pathLib.join(prevImportPath, nodeImportFromPath),
                importAlias: importMember.propertyName?.text,
              };

              // console.log(
              //   '**********\n',
              //   `node cachedExports ${nodeImportFromPath}`,
              //   cachedExports,
              // );
            }
          });
        }
      } else if (hasExportKeyword(declarationNode)) {
        let variableName;

        try {
          // if (ts.isTypeAliasDeclaration(declarationNode) || ts.isFunctionDeclaration(declarationNode)) {
          if (declarationNode?.name?.escapedText) {
            // export function, export type, export enum, export interface...
            variableName = declarationNode.name.escapedText;
          } else {
            // export const
            variableName =
              declarationNode.declarationList.declarations[0].name.escapedText;
          }
          cachedExports[variableName] = {
            importPath: prevImportPath,
            importAlias: undefined,
          };
        } catch (e) {
          console.log(declarationNode);
        }
      }
    }
  });

  // console.log('**********\n', 'cachedExports', cachedExports);

  return cachedExports;
};

module.exports = { collectEsmExports, getIndexFileFromDirectory };
