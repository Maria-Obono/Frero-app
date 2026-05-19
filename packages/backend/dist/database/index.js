"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseRepository = exports.BaseModel = exports.getKnexConfig = exports.closeDatabase = exports.getDatabase = void 0;
var connection_1 = require("./connection");
Object.defineProperty(exports, "getDatabase", { enumerable: true, get: function () { return connection_1.getDatabase; } });
Object.defineProperty(exports, "closeDatabase", { enumerable: true, get: function () { return connection_1.closeDatabase; } });
Object.defineProperty(exports, "getKnexConfig", { enumerable: true, get: function () { return connection_1.getKnexConfig; } });
var base_model_1 = require("./base-model");
Object.defineProperty(exports, "BaseModel", { enumerable: true, get: function () { return base_model_1.BaseModel; } });
var base_repository_1 = require("./base-repository");
Object.defineProperty(exports, "BaseRepository", { enumerable: true, get: function () { return base_repository_1.BaseRepository; } });
//# sourceMappingURL=index.js.map