/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Model, Op } from 'sequelize';

import { BelongsToManyRepository, Collection, HasManyRepository, SortField, TargetKey } from '@nocobase/database';
import { Context } from '..';
import { getRepositoryFromParams } from '../utils';

export async function move(ctx: Context, next) {
  const repository = ctx.databaseRepository || getRepositoryFromParams(ctx);
  const { sourceId, targetId, targetScope, sticky, method } = ctx.action.params;

  let sortField = ctx.action.params.sortField;

  if (repository instanceof BelongsToManyRepository) {
    throw new Error("Sorting association as 'belongs-to-many' type is not supported.");
  }

  if (repository instanceof HasManyRepository && !sortField) {
    sortField = `${repository.association.foreignKey}Sort`;
  }

  const sortAbleCollection = new SortAbleCollection(repository.collection, sortField);

  if (sourceId && targetId) {
    await sortAbleCollection.move(sourceId, targetId, {
      insertAfter: method === 'insertAfter',
    });
  }

  // change scope
  if (sourceId && targetScope) {
    await sortAbleCollection.changeScope(sourceId, targetScope, method);
  }

  if (sourceId && sticky) {
    await sortAbleCollection.sticky(sourceId);
  }

  ctx.body = 'ok';
  await next();
}

interface SortPosition {
  scope?: string;
  id: TargetKey;
}

interface MoveOptions {
  insertAfter?: boolean;
}

export class SortAbleCollection {
  collection: Collection;
  field: SortField;
  scopeKey: string;

  constructor(collection: Collection, fieldName = 'sort') {
    this.collection = collection;
    this.field = collection.getField(fieldName);

    if (!(this.field instanceof SortField)) {
      throw new Error(`${fieldName} is not a sort field`);
    }

    this.scopeKey = this.field.get('scopeKey');
  }

  // insert source position to target position
  async move(sourceInstanceId: TargetKey, targetInstanceId: TargetKey, options: MoveOptions = {}) {
    const sourceInstance = await this.collection.repository.findByTargetKey(sourceInstanceId);
    const targetInstance = await this.collection.repository.findByTargetKey(targetInstanceId);

    if (this.scopeKey && sourceInstance.get(this.scopeKey) !== targetInstance.get(this.scopeKey)) {
      await sourceInstance.update({
        [this.scopeKey]: targetInstance.get(this.scopeKey),
      });
    }

    await this.sameScopeMove(sourceInstance, targetInstance, options);
  }

  async changeScope(sourceInstanceId: TargetKey, targetScope: any, method?: string) {
    const sourceInstance = await this.collection.repository.findByTargetKey(sourceInstanceId);
    const targetScopeValue = targetScope[this.scopeKey];

    if (targetScopeValue && sourceInstance.get(this.scopeKey) !== targetScopeValue) {
      await sourceInstance.update(
        {
          [this.scopeKey]: targetScopeValue,
        },
        {
          silent: false,
        },
      );

      if (method === 'prepend') {
        await this.sticky(sourceInstanceId);
      }
    }
  }

  async sticky(sourceInstanceId: TargetKey) {
    const sourceInstance = await this.collection.repository.findByTargetKey(sourceInstanceId);
    await sourceInstance.update(
      {
        [this.field.get('name')]: 0,
      },
      {
        silent: true,
      },
    );
  }

  async sameScopeMove(sourceInstance: Model, targetInstance: Model, options: MoveOptions) {
    const fieldName = this.field.get('name');

    const sourceSort = sourceInstance.get(fieldName);
    let targetSort = targetInstance.get(fieldName);

    if (options.insertAfter) {
      targetSort = targetSort + 1;
    }

    const scopeValue = this.scopeKey ? sourceInstance.get(this.scopeKey) : null;
    let updateCondition;
    let change;

    if (targetSort > sourceSort) {
      updateCondition = {
        [Op.gt]: sourceSort,
        [Op.lte]: targetSort,
      };
      change = -1;
    } else {
      updateCondition = {
        [Op.lt]: sourceSort,
        [Op.gte]: targetSort,
      };
      change = 1;
    }

    const where = {
      [fieldName]: updateCondition,
    };

    if (scopeValue) {
      where[this.scopeKey] = {
        [Op.eq]: scopeValue,
      };
    }

    await this.collection.model.increment(fieldName, {
      where,
      by: change,
      silent: true,
    });

    await sourceInstance.update(
      {
        [fieldName]: targetSort,
      },
      {
        silent: true,
      },
    );
  }
}
