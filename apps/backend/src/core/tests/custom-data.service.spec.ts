import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CustomDataService } from '../custom-data.service';

describe('CustomDataService', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'machine-gun-custom-data-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tempRoot);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('should merge static and dynamic templates/modules on refresh', async () => {
    const dataDir = path.join(tempRoot, 'data', 'custom');
    fs.mkdirSync(dataDir, { recursive: true });

    fs.writeFileSync(
      path.join(dataDir, 'templates.json'),
      JSON.stringify([
        {
          id: 'dynamic-template',
          name: 'Dynamic Template',
          category: 'Custom',
          template: 'hello-{{person.firstName}}',
        },
      ]),
      'utf-8',
    );

    fs.writeFileSync(
      path.join(dataDir, 'modules.json'),
      JSON.stringify([
        {
          id: 'dynamic-module',
          name: 'dynamicValues',
          values: ['A', 'B'],
        },
      ]),
      'utf-8',
    );

    const service = new CustomDataService();
    await service.refresh();

    const templateIds = service.getTemplates().map((template) => template.id);
    const moduleIds = service.getModules().map((module) => module.id);

    expect(templateIds).toContain('template-full-name');
    expect(templateIds).toContain('dynamic-template');
    expect(moduleIds).toContain('module-status-codes');
    expect(moduleIds).toContain('dynamic-module');
  });

  it('should persist only dynamic templates and modules when saving', async () => {
    const service = new CustomDataService();
    await service.refresh();

    await service.saveTemplate({
      id: 'dynamic-template',
      name: 'Dynamic Template',
      category: 'Custom',
      template: 'hello-{{person.firstName}}',
    });

    await service.saveModule({
      id: 'dynamic-module',
      name: 'dynamicValues',
      values: ['A', 'B'],
    });

    const templatesFile = path.join(tempRoot, 'data', 'custom', 'templates.json');
    const modulesFile = path.join(tempRoot, 'data', 'custom', 'modules.json');
    const savedTemplates = JSON.parse(fs.readFileSync(templatesFile, 'utf-8')) as Array<{
      id: string;
    }>;
    const savedModules = JSON.parse(fs.readFileSync(modulesFile, 'utf-8')) as Array<{ id: string }>;

    expect(savedTemplates).toEqual([
      expect.objectContaining({
        id: 'dynamic-template',
        source: 'dynamic',
      }),
    ]);
    expect(savedModules).toEqual([
      expect.objectContaining({
        id: 'dynamic-module',
        source: 'dynamic',
      }),
    ]);
  });
});
