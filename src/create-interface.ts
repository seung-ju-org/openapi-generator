import * as fs from 'fs';
import { rimraf } from 'rimraf';
import prettier from 'prettier';

const nodeModulesPath = process.cwd() + '/node_modules';
const openapiPath = nodeModulesPath + '/@seung-ju/openapi/.openapi';

const config = require(process.cwd() + '/openapi.config');

export interface PackageJson {
  name?: string;
  description?: string;
  version?: string;
}

export default async function createInterface() {
  if (fs.existsSync(openapiPath)) {
    await rimraf(openapiPath);
  }

  fs.mkdirSync(openapiPath, { recursive: true });

  await Promise.all(
    Object.entries(config).map(async ([key, value]: any) => {
      const path = openapiPath + '/' + key;
      const srcPath = path + '/src';
      const packageJson: PackageJson = {
        name: '@seung-ju/openapi-generator/' + key,
      };
      const interfaces: any = {};
      const $refs: any = {};

      // create folder
      fs.mkdirSync(path);

      // create src folder
      fs.mkdirSync(srcPath);

      if (value.url) {
        const response = await fetch(value.url);
        if (!response.ok) {
          throw new Error('Fetch failed.');
        }
        const data: any = await response.json();
        packageJson.description = data.info.description;
        packageJson.version = data.info.version;

        for (const key in data.components.schemas) {
          const value = data.components.schemas[key];
          const title = value.title ?? key;
          const packagePaths = title.split('.');
          let lastInterface: any = interfaces;
          $refs[key] = title;
          packagePaths.forEach(
            (
              packagePath: any,
              packagePathIndex: any,
              packagePathArray: any,
            ) => {
              if (!lastInterface[packagePath]) {
                lastInterface[packagePath] = {
                  __type: 'namespace',
                };
              }
              if (packagePathIndex === packagePathArray.length - 1) {
                lastInterface[packagePath].__type = 'interface';
                if (value.description) {
                  lastInterface[packagePath].description = value.description;
                }
                switch (value.type) {
                  case 'object':
                    for (const propertyKey in value.properties) {
                      lastInterface[packagePath][propertyKey] =
                        value.properties[propertyKey];
                    }
                    break;
                }
              }
              lastInterface = lastInterface[packagePath];
            },
          );
        }
      }

      let interfaceData: string = '';

      function recursive(interfaces: any) {
        Object.entries(interfaces).forEach(([key, value]: any) => {
          interfaceData += '\n';
          if (value.description) {
            interfaceData += '\n';
            interfaceData += '/**';
            interfaceData += '\n';
            value.description
              .split('<br>')
              .forEach(
                (
                  description: string,
                  descriptionIndex: number,
                  descriptionArray: string[],
                ) => {
                  interfaceData += `* ${description.replace('\n', '')}`;
                  if (descriptionIndex < descriptionArray.length - 1) {
                    interfaceData += '\n';
                  }
                },
              );
            interfaceData += '\n';
            interfaceData += '*/';
            interfaceData += '\n';
          }
          switch (value.__type) {
            case 'namespace':
              interfaceData += `export namespace ${key} {`;
              recursive(value);
              interfaceData += `}`;
              break;
            case 'interface':
              interfaceData += `export interface ${key} {`;
              Object.entries(value).forEach(([key, value]: any) => {
                function typing(type: any, value: any) {
                  interfaceData += '\n';
                  if (value.description) {
                    interfaceData += '\n';
                    interfaceData += '/**';
                    interfaceData += '\n';
                    value.description
                      .split('<br>')
                      .forEach(
                        (
                          description: string,
                          descriptionIndex: number,
                          descriptionArray: string[],
                        ) => {
                          interfaceData += `* ${description.replace('\n', '')}`;
                          if (descriptionIndex < descriptionArray.length - 1) {
                            interfaceData += '\n';
                          }
                        },
                      );
                    interfaceData += '\n';
                    interfaceData += '*/';
                    interfaceData += '\n';
                  }
                  switch (type) {
                    case 'boolean':
                      interfaceData += `${key}: boolean;`;
                      break;
                    case 'integer':
                      interfaceData += `${key}: number;`;
                      break;
                    case 'string':
                      if (value.enum) {
                        interfaceData += `${key}: ${value.enum.map((str: string) => `"${str}"`).join(' | ')};`;
                      } else {
                        interfaceData += `${key}: string;`;
                      }
                      break;
                    case 'array':
                      if (value.items.$ref) {
                        const $ref = value.items.$ref.replace(
                          '#/components/schemas/',
                          '',
                        );
                        if ($refs[$ref]) {
                          interfaceData += `${key}: ${$refs[$ref]}[];`;
                        }
                      } else {
                        typing(value.items.type, value.items);
                      }
                      break;
                    default:
                      if (value.$ref) {
                        const $ref = value.$ref.replace(
                          '#/components/schemas/',
                          '',
                        );
                        if ($refs[$ref]) {
                          interfaceData += `${key}: ${$refs[$ref]};`;
                        }
                      }
                  }
                }
                typing(value.type, value);
              });
              interfaceData += `}`;
              break;
          }
          interfaceData += '\n';
        });
      }

      recursive(interfaces);

      interfaceData = await prettier.format(interfaceData, {
        parser: 'typescript',
      });

      // create package json
      fs.appendFileSync(
        path + '/package.json',
        JSON.stringify(packageJson, null, 2),
      );

      // create interface
      fs.appendFileSync(srcPath + '/interface.ts', interfaceData);
    }),
  );
}
