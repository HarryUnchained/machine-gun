import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { CustomTemplate, CustomModule, getErrorMessage } from '@machine-gun/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { STATIC_CUSTOM_MODULES, STATIC_CUSTOM_TEMPLATES } from '../library/custom-data';

@Injectable()
export class CustomDataService implements OnModuleInit {
  private readonly logger = new Logger(CustomDataService.name);
  private readonly dataDir: string;
  private readonly customDir: string;
  private readonly templatesFile: string;
  private readonly modulesFile: string;

  private templates: CustomTemplate[] = [];
  private modules: CustomModule[] = [];
  private dynamicTemplates: CustomTemplate[] = [];
  private dynamicModules: CustomModule[] = [];

  constructor() {
    const root = process.cwd();
    this.dataDir = path.join(root, 'data');
    this.customDir = path.join(this.dataDir, 'custom');
    this.templatesFile = path.join(this.customDir, 'templates.json');
    this.modulesFile = path.join(this.customDir, 'modules.json');

    this.initializeStorage();
  }

  async onModuleInit() {
    await this.refresh();
  }

  public async refresh(): Promise<void> {
    try {
      this.dynamicTemplates = await this.readJsonArray<CustomTemplate>(
        this.templatesFile,
        'template',
      );
      this.dynamicModules = await this.readJsonArray<CustomModule>(this.modulesFile, 'module');
      this.templates = this.mergeTemplates(STATIC_CUSTOM_TEMPLATES, this.dynamicTemplates);
      this.modules = this.mergeModules(STATIC_CUSTOM_MODULES, this.dynamicModules);
      this.logCustomDataSummary();
    } catch (error: unknown) {
      this.logger.error(`Load failed: ${getErrorMessage(error)}`);
    }
  }

  getTemplates(): CustomTemplate[] {
    return this.templates;
  }

  async saveTemplate(template: CustomTemplate): Promise<void> {
    try {
      this.logger.log(`Saving template ${template.id}`);
      const nextTemplates = this.upsertItem(this.dynamicTemplates, {
        ...template,
        source: 'dynamic',
      });
      await this.writeJsonFile(this.templatesFile, nextTemplates);
      this.dynamicTemplates = nextTemplates;
      this.templates = this.mergeTemplates(STATIC_CUSTOM_TEMPLATES, this.dynamicTemplates);
    } catch (error: unknown) {
      this.logger.error(`Failed to save template: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  getModules(): CustomModule[] {
    return this.modules;
  }

  async saveModule(module: CustomModule): Promise<void> {
    try {
      this.logger.log(`Saving module ${module.id}`);
      const nextModules = this.upsertItem(this.dynamicModules, {
        ...module,
        source: 'dynamic',
      });
      await this.writeJsonFile(this.modulesFile, nextModules);
      this.dynamicModules = nextModules;
      this.modules = this.mergeModules(STATIC_CUSTOM_MODULES, this.dynamicModules);
    } catch (error: unknown) {
      this.logger.error(`Failed to save module: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  async deleteTemplate(id: string): Promise<void> {
    try {
      this.logger.log(`Deleting template ${id}`);
      const nextTemplates = this.removeItemById(this.dynamicTemplates, id);
      await this.writeJsonFile(this.templatesFile, nextTemplates);
      this.dynamicTemplates = nextTemplates;
      this.templates = this.mergeTemplates(STATIC_CUSTOM_TEMPLATES, this.dynamicTemplates);
    } catch (error: unknown) {
      this.logger.error(`Failed to delete template: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  async deleteModule(id: string): Promise<void> {
    try {
      this.logger.log(`Deleting module ${id}`);
      const nextModules = this.removeItemById(this.dynamicModules, id);
      await this.writeJsonFile(this.modulesFile, nextModules);
      this.dynamicModules = nextModules;
      this.modules = this.mergeModules(STATIC_CUSTOM_MODULES, this.dynamicModules);
    } catch (error: unknown) {
      this.logger.error(`Failed to delete module: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  private initializeStorage() {
    const directories = [this.dataDir, this.customDir];

    for (const dir of directories) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        this.logger.log(`Creating required directory: ${dir}`);
      }
    }

    this.ensureFileExists(this.templatesFile, '[]');
    this.ensureFileExists(this.modulesFile, '[]');
  }

  private ensureFileExists(filePath: string, defaultContent: string) {
    if (!fs.existsSync(filePath)) {
      this.logger.debug(`File not found, creating default: ${filePath}`);
      fs.writeFileSync(filePath, defaultContent, 'utf-8');
    }
  }

  private getTemplateCategoryCount(): number {
    const categories = new Set<string>();

    for (const template of this.templates) {
      categories.add(template.category);
    }

    return categories.size;
  }

  private logCustomDataSummary() {
    const categoryCount = this.getTemplateCategoryCount();
    let staticTemplateCount = 0;
    let dynamicTemplateCount = 0;
    let staticModuleCount = 0;
    let dynamicModuleCount = 0;

    for (const template of this.templates) {
      if (template.source === 'dynamic') {
        dynamicTemplateCount++;
        continue;
      }

      staticTemplateCount++;
    }

    for (const module of this.modules) {
      if (module.source === 'dynamic') {
        dynamicModuleCount++;
        continue;
      }

      staticModuleCount++;
    }

    this.logger.log(
      `Loaded ${this.templates.length} templates (${staticTemplateCount} system, ${dynamicTemplateCount} custom) across ${categoryCount} categories and ${this.modules.length} modules (${staticModuleCount} system, ${dynamicModuleCount} custom).`,
    );

    this.logVerboseTemplateDetails();
    this.logVerboseModuleDetails();
  }

  private logVerboseTemplateDetails() {
    for (const template of this.templates) {
      this.logger.verbose(
        [
          `Template ${template.id}`,
          `name="${template.name}"`,
          `category=${template.category}`,
          `source=${template.source ?? 'static'}`,
        ].join(' | '),
      );
    }
  }

  private logVerboseModuleDetails() {
    for (const module of this.modules) {
      this.logger.verbose(
        [
          `Module ${module.id}`,
          `name="${module.name}"`,
          `source=${module.source ?? 'static'}`,
          `values=${module.values.length}`,
        ].join(' | '),
      );
    }
  }

  private async readJsonArray<
    T extends { id?: string; name: string; source?: 'static' | 'dynamic' },
  >(filePath: string, itemType: 'template' | 'module'): Promise<T[]> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as unknown;

    if (!Array.isArray(parsed)) {
      this.logger.warn(`Expected an array in ${filePath}. Falling back to an empty array.`);
      return [];
    }

    const normalizedItems: T[] = [];

    for (const item of parsed) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const typedItem = item as T;
      const normalizedItem = {
        ...typedItem,
        id: typedItem.id ?? this.buildFallbackId(itemType, typedItem.name),
        source: 'dynamic',
      } as T;

      normalizedItems.push(normalizedItem);
    }

    return normalizedItems;
  }

  private async writeJsonFile(filePath: string, value: unknown): Promise<void> {
    const payload = JSON.stringify(value, null, 2);
    await fs.promises.writeFile(filePath, payload, 'utf-8');
  }

  private mergeTemplates(
    staticTemplates: CustomTemplate[],
    dynamicTemplates: CustomTemplate[],
  ): CustomTemplate[] {
    return this.mergeItems(staticTemplates, dynamicTemplates);
  }

  private mergeModules(
    staticModules: CustomModule[],
    dynamicModules: CustomModule[],
  ): CustomModule[] {
    return this.mergeItems(staticModules, dynamicModules);
  }

  private mergeItems<T extends { id: string }>(staticItems: T[], dynamicItems: T[]): T[] {
    const mergedItems: T[] = [];
    const dynamicItemsById = new Map<string, T>();

    for (const item of dynamicItems) {
      dynamicItemsById.set(item.id, item);
    }

    for (const item of staticItems) {
      const override = dynamicItemsById.get(item.id);

      if (override) {
        mergedItems.push(override);
        dynamicItemsById.delete(item.id);
      } else {
        mergedItems.push(item);
      }
    }

    for (const item of dynamicItemsById.values()) {
      mergedItems.push(item);
    }

    return mergedItems;
  }

  private upsertItem<T extends { id: string }>(items: T[], item: T): T[] {
    const nextItems = [...items];

    for (let index = 0; index < nextItems.length; index++) {
      if (nextItems[index]?.id === item.id) {
        nextItems[index] = item;
        return nextItems;
      }
    }

    nextItems.push(item);
    return nextItems;
  }

  private removeItemById<T extends { id: string }>(items: T[], id: string): T[] {
    const nextItems: T[] = [];

    for (const item of items) {
      if (item.id !== id) {
        nextItems.push(item);
      }
    }

    return nextItems;
  }

  private buildFallbackId(itemType: 'template' | 'module', name: string): string {
    return `${itemType}-${name}`;
  }
}
