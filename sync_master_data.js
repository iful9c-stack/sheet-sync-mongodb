const { MongoClient } = require("mongodb");
const { google } = require("googleapis");

//================================================
// CONFIG
//================================================

const CONFIG = {

    spreadsheetId:
        "1P7ib6_aPMVx8V0vi7akTQ8DuBoJfav5eoA6dxFtf9VM",

    databaseName:
        "dashboard_fo",

    sheets: [

        {
            sheetName: "data",
            collectionName: "data"
        },

        {
            sheetName: "user_access",
            collectionName: "user_access"
        }

    ]

};


//================================================
// GOOGLE SHEETS API
//================================================

async function getGoogleSheetsClient() {

    const credentials = JSON.parse(
        process.env.GOOGLE_SERVICE_ACCOUNT
    );

    const auth = new google.auth.GoogleAuth({

        credentials,

        scopes: [
            "https://www.googleapis.com/auth/spreadsheets.readonly"
        ]

    });

    return google.sheets({

        version: "v4",
        auth

    });

}


//================================================
// READ SHEET
//================================================

async function readSheet(sheetName) {

    const sheets = await getGoogleSheetsClient();

    const response =
        await sheets.spreadsheets.values.get({

            spreadsheetId:
                CONFIG.spreadsheetId,

            range:
                sheetName

        });

    return response.data.values || [];

}


//================================================
// CONVERT TO JSON
//================================================

function convertToJson(values) {

    if (values.length <= 1) {
        return [];
    }

    const headers = values[0];

    const rows = values.slice(1);

    return rows.map(row => {

        const obj = {};

        headers.forEach((header, index) => {

            obj[header] = row[index] ?? "";

        });

        return obj;

    });

}


//================================================
// INSERT DATA BY CHUNK
//================================================

async function insertByChunk(collection, data) {

    const chunkSize = 10000;

    for (let i = 0; i < data.length; i += chunkSize) {

        const chunk =
            data.slice(i, i + chunkSize);

        await collection.insertMany(chunk);

        console.log(
            `Inserted ${Math.min(i + chunkSize, data.length)} / ${data.length}`
        );

    }

}


//================================================
// FULL REFRESH SYNC
//================================================

async function syncCollection(db, config) {

    console.log("");
    console.log("========================================");
    console.log(`Sheet      : ${config.sheetName}`);
    console.log(`Collection : ${config.collectionName}`);
    console.log("========================================");


    // READ SHEET

    const values =
        await readSheet(config.sheetName);

    console.log(
        `Total Row Sheet : ${values.length}`
    );


    // CONVERT TO JSON

    const data =
        convertToJson(values);

    console.log(
        `Total Data : ${data.length}`
    );


    // SAFETY CHECK

    if (data.length === 0) {

        throw new Error(
            `${config.sheetName} kosong. Sync dibatalkan.`
        );

    }


    const collection =
        db.collection(config.collectionName);


    // DELETE OLD DATA

    console.log(
        "Deleting old data..."
    );

    await collection.deleteMany({});

    console.log(
        "Old data deleted."
    );


    // INSERT NEW DATA

    console.log(
        "Inserting new data..."
    );

    await insertByChunk(
        collection,
        data
    );


    console.log(
        `${config.collectionName} synced successfully.`
    );

}


//================================================
// MAIN
//================================================

async function main() {

    const client =
        new MongoClient(
            process.env.MONGODB_URI
        );

    try {

        await client.connect();

        console.log("");
        console.log("MongoDB Connected.");
        console.log("");


        const db =
            client.db(
                CONFIG.databaseName
            );


        for (const sheetConfig of CONFIG.sheets) {

            await syncCollection(
                db,
                sheetConfig
            );

        }


        console.log("");
        console.log("ALL MASTER DATA SYNC SUCCESS.");
        console.log("");

    }

    catch (error) {

        console.error("");
        console.error("SYNC FAILED");
        console.error(error);

        process.exit(1);

    }

    finally {

        await client.close();

    }

}


main();
