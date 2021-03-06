import 'dotenv/config';
import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import redis from 'redis';
import RateLimit from 'express-rate-limit';
import RateLimitRedis from 'rate-limit-redis';
import Youch from 'youch';
// -> para ouvir o erros alem do sentry precisamos ouvir os erros que vem dos controllers que usam async
// por padrao o express nao ouve.. dai usaremos a extensao abaixo
import 'express-async-errors';
import * as Sentry from '@sentry/node';
import sentryConfig from './config/sentry';
import routes from './routes';
//
// -> Chama um loader de models para o DB
import './database';

class App {
  constructor() {
    this.server = express();

    // instancia o sentry para vizualizacao de erros
    Sentry.init(sentryConfig);

    this.middlewares();
    this.routes();
    // -> Middleware para tratamento de exceções (erros)
    this.exceptionHandler();
  }

  middlewares() {
    // -> antes de todas as chamadas de rotas chamamos o funcao do sentry
    this.server.use(Sentry.Handlers.requestHandler());
    // -> protecao xss etc
    this.server.use(helmet());
    // -> Cross access origin
    this.server.use(
      cors({
        origin: process.env.FRONT_URL_TO_CORS,
      })
    );
    // -> Habilita o uso de JSON
    this.server.use(express.json());
    // -> Habilita o acesso aos Files da pasta tmp
    this.server.use(
      '/files',
      express.static(path.resolve(__dirname, '..', 'tmp', 'uploads'))
    );
    // -> rate limit
    if (process.env.NODE_ENV !== 'development') {
      this.server.use(
        new RateLimit({
          store: new RateLimitRedis({
            client: redis.createClient({
              host: process.env.REDIS_HOST,
              port: process.env.REDIS_PORT,
            }),
          }),
          windowMs: 1000 * 60 * 15,
          max: 100,
        })
      );
    }
  }

  routes() {
    this.server.use(routes);
    // para finalizar o sentry colocamos a function por volta das rotas a serem ouvidas
    this.server.use(Sentry.Handlers.errorHandler());
  }

  exceptionHandler() {
    this.server.use(async (err, req, res, next) => {
      if (process.env.NODE_ENV === 'development') {
        const errors = await new Youch(err, req).toJSON();
        return res.status(500).json(errors);
      }
      return res.status(500).json({ error: 'Internal Server Error' });
    });
  }
}

export default new App().server;
