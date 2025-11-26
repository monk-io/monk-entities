def main(args):
    """
    Example DigitalOcean Function in Python
    This is a simple HTTP function that demonstrates basic functionality
    """
    import json
    from datetime import datetime
    
    # Get parameters from args
    name = args.get('name', args.get('query', {}).get('name', 'World'))
    method = args.get('__ow_method', 'GET')
    path = args.get('__ow_path', '/')
    
    # Log the incoming request
    print(f"Received {method} request to {path}")
    print(f"Args: {json.dumps(args, indent=2)}")
    
    # Handle different HTTP methods
    if method == 'GET':
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': {
                'message': f'Hello, {name}!',
                'timestamp': datetime.now().isoformat(),
                'method': method,
                'path': path,
                'language': 'Python'
            }
        }
    elif method == 'POST':
        body = args.get('body', args)
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': {
                'message': 'Data received successfully',
                'receivedData': body,
                'timestamp': datetime.now().isoformat()
            }
        }
    else:
        return {
            'statusCode': 405,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': {
                'error': f'Method {method} not allowed',
                'allowedMethods': ['GET', 'POST']
            }
        }
