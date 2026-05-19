"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app_1 = require("./app");
const config_1 = require("./config");
const logger_1 = require("./utils/logger");
const PORT = config_1.config.port;
app_1.app.listen(PORT, () => {
    logger_1.logger.info(`Frero API server running on port ${PORT}`);
});
//# sourceMappingURL=index.js.map