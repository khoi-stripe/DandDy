import SwiftUI

@main
struct DandDyApp: App {
    @StateObject private var authViewModel = AuthViewModel()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authViewModel)
        }
    }
}


