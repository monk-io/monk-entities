exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    
    const response = {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message: 'Hello from AWS Lambda test function!',
            timestamp: new Date().toISOString(),
            eventData: event,
            version: '1.0.0'
        }),
    };
    
    console.log('Response:', JSON.stringify(response, null, 2));
    return response;
}; 