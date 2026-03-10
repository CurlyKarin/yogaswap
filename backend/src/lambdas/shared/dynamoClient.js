"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dynamoClient = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const region = process.env.AWS_REGION || "eu-central-1";
exports.dynamoClient = new client_dynamodb_1.DynamoDBClient({ region });
