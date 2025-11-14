import Foundation

enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized
    case serverError(String)
    case decodingError
    case networkError(Error)
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid response from server"
        case .unauthorized:
            return "Unauthorized - please log in again"
        case .serverError(let message):
            return message
        case .decodingError:
            return "Failed to decode response"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        }
    }
}

class APIClient {
    static let shared = APIClient()
    private init() {}
    
    private let baseURL = APIConfig.baseURL
    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()
    
    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
    }()
    
    private func createRequest(
        endpoint: String,
        method: String,
        body: Data? = nil,
        requiresAuth: Bool = true
    ) throws -> URLRequest {
        guard let url = URL(string: "\(baseURL)\(endpoint)") else {
            throw APIError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if requiresAuth, let token = KeychainHelper.shared.getToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        if let body = body {
            request.httpBody = body
        }
        
        return request
    }
    
    func request<T: Decodable>(
        endpoint: String,
        method: String = "GET",
        body: Encodable? = nil,
        requiresAuth: Bool = true
    ) async throws -> T {
        let bodyData = try body.map { try encoder.encode($0) }
        let request = try createRequest(
            endpoint: endpoint,
            method: method,
            body: bodyData,
            requiresAuth: requiresAuth
        )
        
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.invalidResponse
            }
            
            switch httpResponse.statusCode {
            case 200...299:
                return try decoder.decode(T.self, from: data)
            case 401:
                throw APIError.unauthorized
            case 400...499:
                if let errorDict = try? JSONDecoder().decode([String: String].self, from: data),
                   let detail = errorDict["detail"] {
                    throw APIError.serverError(detail)
                }
                throw APIError.serverError("Client error: \(httpResponse.statusCode)")
            case 500...599:
                throw APIError.serverError("Server error: \(httpResponse.statusCode)")
            default:
                throw APIError.invalidResponse
            }
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.networkError(error)
        }
    }
    
    func requestNoResponse(
        endpoint: String,
        method: String,
        body: Encodable? = nil,
        requiresAuth: Bool = true
    ) async throws {
        let bodyData = try body.map { try encoder.encode($0) }
        let request = try createRequest(
            endpoint: endpoint,
            method: method,
            body: bodyData,
            requiresAuth: requiresAuth
        )
        
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.invalidResponse
            }
            
            switch httpResponse.statusCode {
            case 200...299:
                return
            case 401:
                throw APIError.unauthorized
            case 400...499:
                throw APIError.serverError("Client error: \(httpResponse.statusCode)")
            case 500...599:
                throw APIError.serverError("Server error: \(httpResponse.statusCode)")
            default:
                throw APIError.invalidResponse
            }
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.networkError(error)
        }
    }
}


