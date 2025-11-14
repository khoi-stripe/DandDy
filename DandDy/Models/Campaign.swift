import Foundation

struct Campaign: Codable, Identifiable {
    let id: Int
    let name: String
    let description: String?
    let dmId: Int
    
    enum CodingKeys: String, CodingKey {
        case id, name, description
        case dmId = "dm_id"
    }
}

struct CampaignWithCharacters: Codable, Identifiable {
    let id: Int
    let name: String
    let description: String?
    let dmId: Int
    let characters: [Character]
    
    enum CodingKeys: String, CodingKey {
        case id, name, description, characters
        case dmId = "dm_id"
    }
}

struct CampaignCreate: Codable {
    let name: String
    let description: String?
}


