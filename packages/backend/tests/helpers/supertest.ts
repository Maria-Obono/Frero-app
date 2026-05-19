/**
 * Supertest integration test helper.
 * Provides a configured Supertest agent for API integration tests
 * against the Express app without starting the server.
 *
 * Usage:
 *   import { api, authenticatedApi } from '../helpers/supertest';
 *
 *   describe('POST /api/v1/auth/register', () => {
 *     it('should register a new user', async () => {
 *       const response = await api
 *         .post('/api/v1/auth/register')
 *         .send({ email: 'test@example.com', username: 'testuser', password: 'Test1234!' })
 *         .expect(201);
 *
 *       expect(response.body).toHaveProperty('accessToken');
 *     });
 *   });
 *
 *   describe('GET /api/v1/users/me', () => {
 *     it('should return the authenticated user', async () => {
 *       const agent = authenticatedApi('valid-jwt-token');
 *       const response = await agent
 *         .get('/api/v1/users/me')
 *         .expect(200);
 *
 *       expect(response.body).toHaveProperty('id');
 *     });
 *   });
 */
import request, { SuperTest, Test } from 'supertest';

import { app } from '../../src/app';

/**
 * Unauthenticated Supertest agent for the Express app.
 * Use this for testing public endpoints or auth flows.
 */
export const api: SuperTest<Test> = request(app);

/**
 * Creates an authenticated Supertest agent with a Bearer token.
 * Use this for testing protected endpoints.
 *
 * @param token - JWT access token to include in Authorization header
 * @returns A function that wraps Supertest methods with auth headers
 */
export function authenticatedApi(token: string) {
  return {
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    put: (url: string) => request(app).put(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string) => request(app).patch(url).set('Authorization', `Bearer ${token}`),
    delete: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
  };
}

/**
 * Helper to extract the request ID from a response.
 * All API responses include an X-Request-Id header.
 */
export function getRequestId(response: request.Response): string {
  return response.headers['x-request-id'] as string;
}

/**
 * Helper to assert consistent error response format.
 * All error responses follow: { error: { message, statusCode, requestId } }
 */
export function expectErrorResponse(
  response: request.Response,
  expectedStatus: number,
  expectedMessage?: string,
) {
  expect(response.status).toBe(expectedStatus);
  expect(response.body).toHaveProperty('error');
  expect(response.body.error).toHaveProperty('statusCode', expectedStatus);
  expect(response.body.error).toHaveProperty('requestId');
  if (expectedMessage) {
    expect(response.body.error).toHaveProperty('message', expectedMessage);
  }
}
