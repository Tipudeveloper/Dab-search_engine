const axios = require('axios'); // Library for making HTTP requests
const cheerio = require('cheerio'); // Library for parsing and manipulating HTML
const http = require('http'); // Built-in Node.js module for creating HTTP servers
const WebSocket = require('ws'); // Library for WebSocket communication
const fs = require('fs'); // Built-in Node.js module for file system operations

const visited = new Set(); // Set to keep track of visited URLs to avoid duplicates
let indexedUrls = {}; // Object to store crawled URLs and their metadata
const clients = []; // Array to store connected WebSocket clients

let broadcastQueue = [];
let isBroadcasting = false;

// Define the broadcast function globally
function broadcast(url) {
    broadcastQueue.push(url);
    if (!isBroadcasting) {
        isBroadcasting = true;
        setInterval(() => {
            if (broadcastQueue.length > 0) {
                const urlToSend = broadcastQueue.shift();
                clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ url: urlToSend, data: indexedUrls[urlToSend] }));
                    }
                });
            } else {
                isBroadcasting = false;
            }
        }, 100); // Broadcast every 100ms
    }
}

// Load data.json if it exists
if (fs.existsSync('data.json')) {
    try {
        const rawData = fs.readFileSync('data.json', 'utf-8');
        indexedUrls = JSON.parse(rawData);
        console.log('✅ Data loaded from data.json');

        // Broadcast loaded data to all connected WebSocket clients
        Object.keys(indexedUrls).slice(0, 100).forEach(url => {
            broadcast(url);
        });
    } catch (error) {
        console.error('❌ Error loading data from data.json:', error);
        indexedUrls = {};
    }
} else {
    console.log('⚠️ data.json not found. Starting with an empty index.');
}

// Define the crawl function globally
async function crawl(url, depth = 1) {
    if (depth === 0) return; // Stop if depth is 0
    if (visited.has(url)) return; // Skip if the URL has already been visited

    visited.add(url); // Mark the URL as visited

    try {
        console.log(`📄 Crawling: ${url}`);
        const { data } = await axios.get(url); // Fetch the HTML content of the URL
        const $ = cheerio.load(data); // Load the HTML into Cheerio for parsing

        // Store the crawled data in indexedUrls
        indexedUrls[url] = {
            title: $("title").text() || "No title", // Get the page title
            links: [], // Initialize an empty array for links
            rank: 0, // Initialize the rank
        };

        const links = [];
        $('a').each((i, link) => {
            let href = $(link).attr('href'); // Get the href attribute of each <a> tag
            if (href && href.startsWith('http')) { // Only include valid HTTP links
                links.push(href);
            }
        });

        indexedUrls[url].links = links; // Add the links to the indexedUrls object

        console.log(`Indexed URL: ${url}, Found links: ${links.length}`);

        try {
            fs.writeFileSync('data.json', JSON.stringify(indexedUrls, null, 2), 'utf-8'); // Save the indexed data to data.json
            console.log('✅ Data saved to data.json');
        } catch (err) {
            console.error('❌ Error saving data:', err);
        }

        broadcast(url); // Broadcast the crawled data to WebSocket clients

        // Recursively crawl the found links
        await Promise.all(links.map(link => crawl(link, depth - 1)));

    } catch (error) {
        console.error(`❌ Error crawling ${url}:`, error.message);
    }
}

// Function to recalculate ranks based on backlinks
function recalculateRanks() {
    Object.keys(indexedUrls).forEach(url => {
        let rank = 0;

        // Calculate rank based on backlinks
        Object.values(indexedUrls).forEach(page => {
            if (page.links.includes(url)) {
                rank += 10; // Reward pages that are linked by others
            }
        });

        // Update the rank
        indexedUrls[url].rank = rank;
    });

    // Remove or comment out this line to avoid printing the data
    // console.log('🔄 Ranks recalculated:', indexedUrls);
    console.log('🔄 Ranks recalculated.');
}

// Start recalculating ranks every 1 second
setInterval(recalculateRanks, 1000);

// Create an HTTP server to serve the search engine interface
const server = http.createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dab - Search Engine</title>
            <style>
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }
    body {
        font-family: 'Roboto', sans-serif;
        background: linear-gradient(135deg, #1d3557, #457b9d);
        color: #f1faee;
        padding: 20px;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
    }
    h1 {
        font-size: 2.5rem;
        color: #a8dadc;
        text-transform: uppercase;
        letter-spacing: 2px;
        margin-bottom: 30px;
        font-weight: bold;
    }
    #searchResults {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 20px;
        max-height: 500px;
        overflow-y: auto;
        border: 2px solid #a8dadc;
        padding: 20px;
        background-color: #1d3557;
        border-radius: 15px;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
    }
    .result-item {
        background: linear-gradient(135deg, #457b9d, #1d3557);
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        text-align: center;
        transition: transform 0.3s ease, box-shadow 0.3s ease;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
    }
    .result-item:hover {
        transform: translateY(-5px);
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
        background: linear-gradient(135deg, #a8dadc, #457b9d);
    }
    .result-item a {
        color: #f1faee;
        text-decoration: none;
        font-size: 1.2rem;
        font-weight: bold;
        transition: color 0.3s ease;
        margin-bottom: 10px;
    }
    .result-item a:hover {
        color: #ffb703;
        text-decoration: underline;
    }
    .result-item .metadata {
        font-size: 0.9rem;
        color: #b0bec5;
        margin-top: 10px;
    }
    .pagination button {
        padding: 10px 20px;
        margin: 5px;
        font-size: 1rem;
        cursor: pointer;
        background-color: #ffb703;
        color: #1d3557;
        border-radius: 5px;
        border: none;
        transition: background-color 0.3s ease, transform 0.2s ease;
    }
    .pagination button:hover {
        background-color: #fb8500;
        transform: scale(1.05);
    }
</style>

        </head>
        <body>
        <h1>Dab Search Engine</h1>
        <input type="text" id="searchQuery" placeholder="Search..." style="padding: 10px; margin-bottom: 20px; font-size: 1rem; width: 300px; border-radius: 5px; border: 1px solid #ccc;" />
        <button onclick="search()" style="padding: 10px 20px; font-size: 1rem; cursor: pointer; background-color: #0077ff; color: white; border-radius: 5px; border: none;">Search</button>
        <div id="searchResults"></div>
        <div class="pagination" id="pagination"></div>
        <script>
            // WebSocket client-side logic
            const socket = new WebSocket('ws://' + window.location.host); // Connect to the WebSocket server
            const searchResultsElement = document.getElementById('searchResults'); // Get the search results container
            const paginationElement = document.getElementById('pagination'); // Get the pagination container
            const indexedUrls = {}; // Object to store received URLs and their data
            let currentPage = 1; // Current page number
            const resultsPerPage = 10; // Number of results per page

            // Handle incoming WebSocket messages
            socket.onmessage = (event) => {
                const { url, data } = JSON.parse(event.data); // Parse the received data
                console.log('📥 Received data:', url, data); // Log the received data
                indexedUrls[url] = data; // Update the indexedUrls object with the received data
            };

            socket.onopen = () => console.log('✅ Connected to WebSocket!'); // Log when the WebSocket connection is established
            socket.onerror = (error) => console.error('❌ WebSocket error:', error); // Log any WebSocket errors

            // Function to display results for the current page
            function displayResults(page) {
                searchResultsElement.innerHTML = ''; // Clear previous results
                const query = document.getElementById('searchQuery').value.toLowerCase(); // Get the search query

                // Filter and sort the results based on the query
                const sortedResults = Object.entries(indexedUrls)
                    .filter(([url, data]) => data.title.toLowerCase().includes(query)) // Filter by title
                    .sort((a, b) => b[1].rank - a[1].rank); // Sort by rank

                // Calculate the start and end indices for the current page
                const startIndex = (page - 1) * resultsPerPage;
                const endIndex = startIndex + resultsPerPage;

                // Display the results for the current page
                sortedResults.slice(startIndex, endIndex).forEach(([url, data]) => {
                    const listItem = document.createElement('div');
                    listItem.className = 'result-item'; // Add a class for styling
                    listItem.innerHTML = '<a href="' + url + '" target="_blank">' + data.title + '</a>';
                    searchResultsElement.appendChild(listItem);
                });

                // Show a message if no results are found
                if (sortedResults.length === 0) {
                    searchResultsElement.innerHTML = '<div class="result-item">No results found</div>';
                }

                // Update pagination buttons
                updatePagination(sortedResults.length);
            }

            // Function to update pagination buttons
            function updatePagination(totalResults) {
                paginationElement.innerHTML = ''; // Clear previous pagination buttons
                const totalPages = Math.ceil(totalResults / resultsPerPage); // Calculate total pages

                for (let i = 1; i <= totalPages; i++) {
                    const button = document.createElement('button');
                    button.textContent = 'Row ' + i;
                    button.onclick = () => {
                        currentPage = i;
                        displayResults(currentPage);
                    };
                    if (i === currentPage) {
                        button.style.backgroundColor = '#0058cc'; // Highlight the current page
                    }
                    paginationElement.appendChild(button);
                }
            }

            // Search function to filter and display results
            function search() {
                currentPage = 1; // Reset to the first page
                displayResults(currentPage); // Display results for the first page
            }
        </script>
        <div class="footer">
            <p>Powered by <a href="https://github.com/Tipudeveloper" target="_blank">Tipudev</a></p>
        </div>
        </body>
        </html>
        `);
    }
});

// Create a WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('✅ New WebSocket connection established!');
    clients.push(ws);

    // Send all loaded data to the new client
    Object.keys(indexedUrls).forEach(url => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ url, data: indexedUrls[url] }));
        }
    });

    ws.on('close', () => {
        const index = clients.indexOf(ws);
        if (index > -1) {
            clients.splice(index, 1);
        }
        console.log('❌ WebSocket connection closed!');
    });
});

// Start the server
server.listen(3000, () => {
    console.log('🌍 Server running at http://localhost:3000');
});

// Start crawling from the initial URL
crawl('https://tolagaming.github.io/crawlerdream/', 5) // when you want to crawl change the depth to 5 when you dont want to crawl change the depth to 0
    .then(() => {
        console.log('✅ Crawling completed!');
    })
    .catch((error) => console.error('❌ Crawling failed:', error.message));
