import type { FastifyInstance } from 'fastify';
import {
  recipeCookZ,
  recipeCreateZ,
  recipePatchZ,
  recipeSearchQueryZ,
} from '@sophie/shared';
import { getPool } from '../db/postgres.js';
import {
  cookRecipe,
  createRecipe,
  deleteRecipe,
  getRecipeDetail,
  listAllTags,
  listRecipes,
  matchRecipe,
  patchRecipe,
} from '../services/recipes-service.js';
import { cleanupPhotoKeys } from '../services/photo-service.js';
import { parseId } from '../util/params.js';

export async function recipesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/recipes', async (req) => {
    const q = recipeSearchQueryZ.parse(req.query);
    return listRecipes(getPool(), q);
  });

  app.get('/api/v1/recipes/tags', async () => {
    return { items: await listAllTags(getPool()) };
  });

  app.post('/api/v1/recipes', async (req, reply) => {
    const body = recipeCreateZ.parse(req.body);
    const recipe = await createRecipe(getPool(), body);
    reply.status(201);
    return getRecipeDetail(getPool(), recipe.id);
  });

  app.get('/api/v1/recipes/:id', async (req) => {
    const id = parseId(req.params);
    return getRecipeDetail(getPool(), id);
  });

  app.patch('/api/v1/recipes/:id', async (req) => {
    const id = parseId(req.params);
    const body = recipePatchZ.parse(req.body);
    await patchRecipe(getPool(), id, body);
    return getRecipeDetail(getPool(), id);
  });

  app.delete('/api/v1/recipes/:id', async (req, reply) => {
    const id = parseId(req.params);
    const { photoKeyPrefixes } = await deleteRecipe(getPool(), id);
    await cleanupPhotoKeys(photoKeyPrefixes);
    reply.status(204);
    return null;
  });

  app.get('/api/v1/recipes/:id/match', async (req) => {
    const id = parseId(req.params);
    const m = await matchRecipe(getPool(), id);
    return {
      recipe_id: id,
      match_status: m.status,
      ingredients: m.ingredients,
      counts: m.counts,
    };
  });

  app.post('/api/v1/recipes/:id/cook', async (req) => {
    const id = parseId(req.params);
    const body = recipeCookZ.parse(req.body ?? {});
    return cookRecipe(getPool(), id, body);
  });
}
