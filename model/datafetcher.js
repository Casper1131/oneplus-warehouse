const { HeavyList } = require('./heavylist');
const axios = require('axios');

class DataFetcher {
    constructor(endpoints) {
        this.queue = new HeavyList([]);
        //method for pulling data and method for sending data
        this.endpoints = endpoints;
        this.results = [];
    }

    async process(data) {
        try {
            const response = await data.fetch();
            const final = await data.send(response);
        } catch (error) {
            console.error(`Error fetching from ${data}:`, error.message);
        }
    }

    processQueue() {
        this.queue.loop(1000, 
            (completedList) => console.log("All data fetched.", completedList), 
            (url, resumeCallback) => {
                this.process(url).then(() => resumeCallback());
            }
        );
    }

    addRequestsToQueue() {
        this.endpoints.forEach(endpoint => {
            this.queue.addItemLoop(endpoint);
        });
    }
}

// Example usage
const endpoints = [
    {fetch:function(){},send:function(){}},
    {fetch:function(){},send:function(){}},
    {fetch:function(){},send:function(){}},
];

const fetcher = new DataFetcher(endpoints);
fetcher.addRequestsToQueue();
fetcher.processQueue();
