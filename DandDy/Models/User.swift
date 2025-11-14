import Foundation

enum UserRole: String, Codable {
    case player = "player"
    case dm = "dm"
}

struct User: Codable, Identifiable {
    let id: Int
    let email: String
    let username: String
    let role: UserRole
}

struct UserCreate: Codable {
    let email: String
    let username: String
    let password: String
    let role: UserRole
}

struct UserLogin: Codable {
    let email: String
    let password: String
}

struct TokenResponse: Codable {
    let accessToken: String
    let tokenType: String
    
    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case tokenType = "token_type"
    }
}


