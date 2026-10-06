# Build context is the repo root, so fonts/ is available.
FROM mcr.microsoft.com/dotnet/sdk:10.0.401-alpine3.24 AS build
WORKDIR /src
COPY backend/Directory.Build.props backend/Directory.Packages.props backend/
COPY backend/Updf.Api/Updf.Api.csproj backend/Updf.Api/
RUN dotnet restore backend/Updf.Api
COPY fonts/ fonts/
COPY backend/Updf.Api/ backend/Updf.Api/
RUN dotnet publish backend/Updf.Api -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0.12-alpine3.24
WORKDIR /app
COPY --from=build /app .
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "Updf.Api.dll"]
